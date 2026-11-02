/**
 * 直连 B站 的 HTTPS 客户端（Cloudflare Workers）
 *
 * 背景：Workers 的 fetch() 出口 IP 段被 B站 判定为 -412，
 * 而 connect() 建立的 TCP socket 走另一组出口，能正常访问。
 * 因此这里用 cloudflare:sockets 手写 HTTP/1.1 over TLS。
 */
import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function findHeaderEnd(buffer) {
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (buffer[i] === 13 && buffer[i + 1] === 10 && buffer[i + 2] === 13 && buffer[i + 3] === 10) return i + 4;
  }
  return -1;
}

function decodeChunked(buffer) {
  const parts = [];
  let offset = 0;
  while (offset < buffer.length) {
    let lineEnd = -1;
    for (let i = offset; i + 1 < buffer.length; i += 1) {
      if (buffer[i] === 13 && buffer[i + 1] === 10) { lineEnd = i; break; }
    }
    if (lineEnd < 0) break;
    const size = parseInt(decoder.decode(buffer.subarray(offset, lineEnd)).trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    parts.push(buffer.subarray(start, start + size));
    offset = start + size + 2;
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) { merged.set(part, cursor); cursor += part.length; }
  return merged;
}

/**
 * 经 connect() 发起一次 HTTPS 请求。
 * @returns {{status:number, headers:Object, setCookie:string[], text:string, json:any}}
 */
export async function httpsRequest(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("仅支持 https://");
  const hostname = parsed.hostname;
  const port = Number(parsed.port || 443);
  const timeoutMs = options.timeoutMs || 15000;

  const socket = connect({ hostname, port }, { secureTransport: "on" });
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("连接超时")), timeoutMs);
  });

  try {
    await Promise.race([socket.opened, timeout]);
    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();

    const headers = {
      Host: hostname,
      "User-Agent": options.userAgent || "Mozilla/5.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Connection: "close",
      ...(options.headers || {})
    };
    const method = String(options.method || "GET").toUpperCase();
    let bodyText = "";
    if (options.body !== undefined && options.body !== null) {
      bodyText = typeof options.body === "string" ? options.body : new URLSearchParams(options.body).toString();
      headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
      headers["Content-Length"] = String(encoder.encode(bodyText).length);
    }

    const path = `${parsed.pathname || "/"}${parsed.search}`;
    const head = `${method} ${path} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`;
    await writer.write(encoder.encode(head + bodyText));

    let buffer = new Uint8Array(0);
    const deadline = Date.now() + timeoutMs;
    let headerEnd = -1;
    while (headerEnd < 0) {
      if (buffer.length > 2 * 1024 * 1024) throw new Error("响应过大");
      if (Date.now() > deadline) throw new Error("读取响应超时");
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      if (value && value.length) buffer = concat(buffer, value);
      headerEnd = findHeaderEnd(buffer);
    }
    if (headerEnd < 0) throw new Error("响应头不完整");

    const headText = decoder.decode(buffer.subarray(0, headerEnd));
    const [statusLine, ...rawLines] = headText.split("\r\n");
    const statusMatch = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})/);
    if (!statusMatch) throw new Error("状态行非法");
    const status = Number(statusMatch[1]);

    const responseHeaders = {};
    const setCookie = [];
    for (const line of rawLines) {
      const index = line.indexOf(":");
      if (index <= 0) continue;
      const name = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      if (name === "set-cookie") setCookie.push(value);
      else responseHeaders[name] = value;
    }

    let body = buffer.subarray(headerEnd);
    const chunked = /chunked/i.test(responseHeaders["transfer-encoding"] || "");
    const contentLength = Number(responseHeaders["content-length"] || -1);

    const doneReading = () => {
      if (chunked) {
        if (body.length < 5) return false;
        const tail = body.subarray(body.length - 5);
        return tail[0] === 48 && tail[1] === 13 && tail[2] === 10 && tail[3] === 13 && tail[4] === 10;
      }
      if (contentLength >= 0) return body.length >= contentLength;
      return true;
    };

    while (!doneReading()) {
      if (Date.now() > deadline) break;
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      if (value && value.length) body = concat(body, value);
    }

    let bytes = chunked ? decodeChunked(body) : body;
    if (contentLength >= 0 && bytes.length > contentLength) bytes = bytes.subarray(0, contentLength);
    const text = decoder.decode(bytes);

    let json = null;
    try { json = JSON.parse(text); } catch (error) {}

    return { status, headers: responseHeaders, setCookie, text, json };
  } finally {
    if (timer) clearTimeout(timer);
    try { socket.close(); } catch (error) {}
  }
}
