import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 3217);
const HOST = process.env.HOST || "127.0.0.1";
const API_TOKEN = String(process.env.API_TOKEN || "");
const REQUEST_TIMEOUT_MS = 45000;
const MAX_BODY_BYTES = 32768;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 4;
const WEB_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

if (API_TOKEN.length < 32) {
  throw new Error("API_TOKEN must contain at least 32 characters");
}

const rateLimits = new Map();
let busy = false;
let browserPromise;

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function tokenMatches(header) {
  const supplied = String(header || "").replace(/^Bearer\s+/i, "");
  if (!supplied) return false;
  const expectedHash = createHash("sha256").update(API_TOKEN).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

function clientKey(request) {
  return String(request.headers["cf-connecting-ip"] || request.socket.remoteAddress || "unknown");
}

function isRateLimited(request) {
  const key = clientKey(request);
  const now = Date.now();
  const recent = (rateLimits.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateLimits.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimits.set(key, recent);
  return false;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("request body is not valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeCookie(value) {
  const cookie = String(value || "").trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) return "";
  if (!/(?:^|;\s*)(?:sessionid|sessionid_ss)=[^;]+/i.test(cookie)) return "";
  return cookie;
}

function toBrowserCookies(cookieHeader) {
  return cookieHeader.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return null;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || !value) return null;
    return {
      name,
      value,
      domain: ".tiktok.com",
      path: "/",
      secure: true,
      sameSite: "None"
    };
  }).filter(Boolean);
}

function listFromPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.itemList)) return payload.itemList;
  if (Array.isArray(payload.item_list)) return payload.item_list;
  const scope = payload.__DEFAULT_SCOPE__;
  const forYou = scope && scope["webapp.foryou.video"];
  return forYou && Array.isArray(forYou.itemList) ? forYou.itemList : [];
}

function sanitizeItem(item) {
  if (!item || typeof item !== "object" || !/^\d{10,25}$/.test(String(item.id || ""))) return null;
  const author = item.author && typeof item.author === "object" ? item.author : {};
  const stats = item.stats && typeof item.stats === "object" ? item.stats : {};
  const video = item.video && typeof item.video === "object" ? item.video : {};
  const bitrateInfo = Array.isArray(video.bitrateInfo) ? video.bitrateInfo.slice(0, 8).map((entry) => {
    const address = entry && (entry.PlayAddr || entry.playAddr);
    const urls = address && Array.isArray(address.UrlList) ? address.UrlList.filter((url) => /^https?:\/\//i.test(String(url))).slice(0, 2) : [];
    if (!urls.length) return null;
    return {
      GearName: String(entry.GearName || entry.gearName || ""),
      PlayAddr: {
        Height: Number(address.Height || 0),
        DataSize: Number(address.DataSize || 0),
        UrlList: urls
      }
    };
  }).filter(Boolean) : [];

  return {
    id: String(item.id),
    desc: String(item.desc || ""),
    createTime: String(item.createTime || ""),
    author: {
      uniqueId: String(author.uniqueId || ""),
      nickname: String(author.nickname || ""),
      avatarMedium: String(author.avatarMedium || author.avatarThumb || "")
    },
    stats: {
      playCount: Number(stats.playCount || 0),
      diggCount: Number(stats.diggCount || 0),
      commentCount: Number(stats.commentCount || 0),
      shareCount: Number(stats.shareCount || 0)
    },
    video: {
      duration: Number(video.duration || 0),
      cover: String(video.cover || ""),
      originCover: String(video.originCover || ""),
      dynamicCover: String(video.dynamicCover || ""),
      playAddr: String(video.playAddr || ""),
      downloadAddr: String(video.downloadAddr || ""),
      bitrateInfo
    }
  };
}

function uniqueItems(items, limit) {
  const seen = new Set();
  const results = [];
  for (const raw of items) {
    const item = sanitizeItem(raw);
    if (!item || !item.author.uniqueId || seen.has(item.id)) continue;
    seen.add(item.id);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"]
    });
  }
  return browserPromise;
}

async function collectRecommendations(cookie, language, limit) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: WEB_USER_AGENT,
    locale: language,
    timezoneId: "Asia/Taipei",
    viewport: { width: 1280, height: 900 }
  });
  const captured = [];

  try {
    await context.addCookies(toBrowserCookies(cookie));
    const page = await context.newPage();
    page.on("response", async (response) => {
      if (!response.url().includes("/api/recommend/item_list")) return;
      try {
        captured.push(...listFromPayload(await response.json()));
      } catch (error) {
        // TikTok sometimes returns an empty or non-JSON anti-bot response.
      }
    });

    await page.goto(`https://www.tiktok.com/foryou?lang=${encodeURIComponent(language)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const hydrationText = await page.locator("#__UNIVERSAL_DATA_FOR_REHYDRATION__").textContent({ timeout: 5000 }).catch(() => "");
    if (hydrationText) {
      try {
        captured.push(...listFromPayload(JSON.parse(hydrationText)));
      } catch (error) {
        // Keep waiting for the signed API response.
      }
    }

    await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, 2000))).catch(() => {});
    await page.waitForTimeout(6000);
    return uniqueItems(captured, limit);
  } finally {
    await context.close();
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/recommend") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  if (!tokenMatches(request.headers.authorization)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (isRateLimited(request)) {
    sendJson(response, 429, { error: "rate_limited" }, { "Retry-After": "60" });
    return;
  }
  if (busy) {
    sendJson(response, 429, { error: "busy" }, { "Retry-After": "10" });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: "invalid_request" });
    return;
  }

  const cookie = normalizeCookie(body.cookie);
  if (!cookie) {
    sendJson(response, 400, { error: "invalid_cookie" });
    return;
  }
  const language = body.language === "zh-Hans" ? "zh-Hans" : "zh-Hant";
  const limit = Math.min(20, Math.max(1, Number(body.limit || 12)));
  busy = true;
  const startedAt = Date.now();

  try {
    const items = await Promise.race([
      collectRecommendations(cookie, language, limit),
      new Promise((_, reject) => setTimeout(() => reject(new Error("request timed out")), REQUEST_TIMEOUT_MS))
    ]);
    console.log("recommendation request completed", { count: items.length, elapsedMs: Date.now() - startedAt });
    sendJson(response, 200, { items });
  } catch (error) {
    console.error("recommendation request failed", { message: error.message, elapsedMs: Date.now() - startedAt });
    sendJson(response, 502, { error: "upstream_failed" });
  } finally {
    busy = false;
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TikTok recommendation service listening on http://${HOST}:${PORT}`);
});

async function shutdown() {
  server.close();
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser) await browser.close();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
