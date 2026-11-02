/**
 * SOCKS5 隧道 + HTTP 请求（Cloudflare Workers）
 *
 * api.bilibili.com 支持明文 HTTP，可直接经 SOCKS5 建隧道发送 HTTP 请求。
 * passport.bilibili.com 强制 HTTPS，需要 TLS —— Workers 的 connect() 无法在
 * 既有的 SOCKS5 隧道上再做 TLS 握手（startTls 只对原始目标生效），
 * 因此 HTTPS 目标改由「代理侧 CONNECT」或直接回退。
 */
import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function parseProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let text = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `socks5://${text}`;
  const match = text.match(/^(socks5h?):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?(\[[0-9a-f:]+\]|[^:/?#]+):(\d{1,5})\/?$/i);
  if (!match) return null;
  const port = Number(match[5]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const host = match[4].replace(/^\[|\]$/g, "");
  if (!host) return null;
  return {
    host,
    port,
    user: decodeURIComponent(match[2] || ""),
    pass: decodeURIComponent(match[3] || ""),
    raw: text,
    redacted: `socks5://${match[2] ? "***@" : ""}${host}:${port}`
  };
}

function concat(left, right) {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

/**
 * 建立 SOCKS5 隧道并完成到目标主机的 CONNECT。
 * 返回可直接读写的裸 TCP 流（未加密）。
 */
export async function openSocksTunnel(proxy, hostname, port, timeoutMs = 12000) {
  if (!proxy) throw new Error("未配置代理");
  const socket = connect({ hostname: proxy.host, port: proxy.port }, { secureTransport: "off" });
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("SOCKS5 连接超时")), timeoutMs);
  });

  try {
    await Promise.race([socket.opened, timeout]);
    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();
    let pending = new Uint8Array(0);

    async function readExact(size) {
      let buffer = pending;
      pending = new Uint8Array(0);
      while (buffer.length < size) {
        const { value, done } = await Promise.race([reader.read(), timeout]);
        if (done) throw new Error("SOCKS5 连接被代理关闭");
        if (value && value.length) buffer = concat(buffer, value);
      }
      pending = buffer.subarray(size);
      return buffer.subarray(0, size);
    }

    // 1. 协商认证
    const methods = proxy.user ? [0x00, 0x02] : [0x00];
    await writer.write(new Uint8Array([5, methods.length, ...methods]));
    const greeting = await readExact(2);
    if (greeting[0] !== 5) throw new Error("代理不是 SOCKS5");
    if (greeting[1] === 0xff) throw new Error("代理拒绝所有认证方式");
    if (greeting[1] === 0x02) {
      const user = encoder.encode(proxy.user || "");
      const pass = encoder.encode(proxy.pass || "");
      if (user.length > 255 || pass.length > 255) throw new Error("代理用户名/密码过长");
      await writer.write(new Uint8Array([1, user.length, ...user, pass.length, ...pass]));
      const auth = await readExact(2);
      if (auth[1] !== 0) throw new Error("代理用户名或密码错误");
    } else if (greeting[1] !== 0x00) {
      throw new Error(`代理要求不支持的认证方式 ${greeting[1]}`);
    }

    // 2. CONNECT 目标
    const cleanHost = String(hostname || "");
    let request;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(cleanHost)) {
      const octets = cleanHost.split(".").map(Number);
      if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error("目标 IPv4 非法");
      request = new Uint8Array([5, 1, 0, 1, ...octets, (port >> 8) & 0xff, port & 0xff]);
    } else {
      const name = encoder.encode(cleanHost);
      if (name.length > 255) throw new Error("目标域名过长");
      request = new Uint8Array([5, 1, 0, 3, name.length, ...name, (port >> 8) & 0xff, port & 0xff]);
    }
    await writer.write(request);
    const reply = await readExact(4);
    if (reply[0] !== 5) throw new Error("SOCKS5 响应异常");
    if (reply[1] !== 0) throw new Error(`代理无法连接目标（代码 ${reply[1]}）`);
    const atyp = reply[3];
    if (atyp === 1) await readExact(4 + 2);
    else if (atyp === 4) await readExact(16 + 2);
    else if (atyp === 3) {
      const length = await readExact(1);
      await readExact(length[0] + 2);
    } else throw new Error("SOCKS5 地址类型未知");

    return { socket, reader, writer, pending };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 经 SOCKS5 隧道发一次明文 HTTP/1.1 请求。
 * 仅支持 http://，调用方需自行保证。
 */
export async function socksHttpRequest(proxy, targetUrl, options = {}) {
  const url = new URL(targetUrl);
  if (url.protocol !== "http:") throw new Error("socksHttpRequest 仅支持 http://");
  const port = Number(url.port || 80);
  const tunnel = await openSocksTunnel(proxy, url.hostname, port, options.timeoutMs);

  try {
    const headers = {
      Host: url.host,
      "User-Agent": options.userAgent || "Mozilla/5.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Connection: "close",
      ...(options.headers || {})
    };
    const path = `${url.pathname}${url.search}`;
    const headerLines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    const requestText = `GET ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n`;
    await tunnel.writer.write(encoder.encode(requestText));

    // 读取完整响应
    let buffer = tunnel.pending && tunnel.pending.length ? tunnel.pending : new Uint8Array(0);
    const deadline = Date.now() + (options.timeoutMs || 12000);
    let headerEnd = -1;
    while (true) {
      if (buffer.length > 262144) throw new Error("响应过大");
      headerEnd = findHeaderEnd(buffer);
      if (headerEnd >= 0) break;
      if (Date.now() > deadline) throw new Error("读取响应超时");
      const { value, done } = await tunnel.reader.read();
      if (done) break;
      if (value && value.length) buffer = concat(buffer, value);
    }
    if (headerEnd < 0) throw new Error("响应头不完整");

    const headText = decoder.decode(buffer.subarray(0, headerEnd));
    const [statusLine, ...rawHeaderLines] = headText.split("\r\n");
    const statusMatch = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})/);
    if (!statusMatch) throw new Error("响应状态行非法");
    const status = Number(statusMatch[1]);

    const responseHeaders = {};
    for (const line of rawHeaderLines) {
      const index = line.indexOf(":");
      if (index <= 0) continue;
      const name = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      if (name === "set-cookie") (responseHeaders["set-cookie"] = responseHeaders["set-cookie"] || []).push(value);
      else responseHeaders[name] = value;
    }

    let body = buffer.subarray(headerEnd);
    const chunked = /chunked/i.test(responseHeaders["transfer-encoding"] || "");
    const contentLength = Number(responseHeaders["content-length"] || -1);

    while (true) {
      if (chunked) {
        if (chunkedLooksComplete(body)) break;
      } else if (contentLength >= 0) {
        if (body.length >= contentLength) break;
      } else break;
      if (Date.now() > deadline) break;
      const { value, done } = await tunnel.reader.read();
      if (done) break;
      if (value && value.length) body = concat(body, value);
    }

    let text = decoder.decode(chunked ? decodeChunked(body) : body);
    if (contentLength >= 0 && text.length > contentLength) text = text.slice(0, contentLength);

    return {
      status,
      headers: responseHeaders,
      text,
      setCookie: responseHeaders["set-cookie"] || [],
      via: "socks5"
    };
  } finally {
    try { await tunnel.writer.close(); } catch (error) {}
    try { tunnel.socket.close(); } catch (error) {}
  }
}

function findHeaderEnd(buffer) {
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (buffer[i] === 13 && buffer[i + 1] === 10 && buffer[i + 2] === 13 && buffer[i + 3] === 10) return i + 4;
  }
  return -1;
}

function chunkedLooksComplete(buffer) {
  // 以 0\r\n\r\n 结尾视为完成
  if (buffer.length < 5) return false;
  const tail = buffer.subarray(buffer.length - 5);
  return tail[0] === 48 && tail[1] === 13 && tail[2] === 10 && tail[3] === 13 && tail[4] === 10;
}

function decodeChunked(buffer) {
  const out = [];
  let offset = 0;
  while (offset < buffer.length) {
    let lineEnd = -1;
    for (let i = offset; i + 1 < buffer.length; i += 1) {
      if (buffer[i] === 13 && buffer[i + 1] === 10) { lineEnd = i; break; }
    }
    if (lineEnd < 0) break;
    const size = parseInt(decoder.decode(buffer.subarray(offset, lineEnd)).trim(), 16);
    if (!Number.isFinite(size) || size < 0) break;
    const start = lineEnd + 2;
    if (size === 0) break;
    out.push(buffer.subarray(start, start + size));
    offset = start + size + 2;
  }
  const total = out.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of out) { merged.set(part, cursor); cursor += part.length; }
  return merged;
}

/** 探测代理是否可用：走隧道请求 B站 明文接口 */
export async function testProxy(proxy, timeoutMs = 10000) {
  const started = Date.now();
  try {
    const result = await socksHttpRequest(proxy, "http://api.bilibili.com/x/frontend/finger/spi", { timeoutMs });
    let code = null;
    try { code = JSON.parse(result.text).code; } catch (error) {}
    return {
      ok: code === 0,
      status: result.status,
      code,
      ms: Date.now() - started,
      message: code === 0 ? "代理可用，B站返回正常" : `B站返回 ${code}`
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, message: String(error && error.message || error).slice(0, 120) };
  }
}
