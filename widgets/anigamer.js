WidgetMetadata = {
  id: "makka.anigamer.popular",
  title: "动画疯人气榜",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "直接读取巴哈姆特动画疯公开动画列表；需要将 ani.gamer.com.tw 分流到台湾节点",
  author: "MakkaPakka",
  site: "https://ani.gamer.com.tw/animeList.php",
  detailCacheDuration: 3600,
  modules: [
    {
      id: "loadAniGamer",
      title: "动画疯榜单",
      functionName: "loadAniGamer",
      cacheDuration: 3600,
      requiresWebView: false,
      sectionMode: false,
      params: [
        {
          name: "sort",
          title: "排序",
          type: "enumeration",
          value: "2",
          enumOptions: [
            { title: "月人气排行", value: "2" },
            { title: "年份排序", value: "1" }
          ]
        },
        {
          name: "tag",
          title: "属性",
          type: "enumeration",
          value: "全部",
          enumOptions: [
            { title: "全部", value: "全部" },
            { title: "动作", value: "動作" },
            { title: "冒险", value: "冒險" },
            { title: "奇幻", value: "奇幻" },
            { title: "异世界", value: "異世界" },
            { title: "科幻", value: "科幻" },
            { title: "校园", value: "校園" },
            { title: "喜剧", value: "喜劇" },
            { title: "恋爱", value: "戀愛" },
            { title: "悬疑", value: "懸疑" },
            { title: "运动", value: "運動" },
            { title: "特摄", value: "特攝" },
            { title: "BL", value: "BL" },
            { title: "GL", value: "GL" }
          ]
        },
        {
          name: "category",
          title: "类型",
          type: "enumeration",
          value: "全部",
          enumOptions: [
            { title: "全部", value: "全部" },
            { title: "电影", value: "電影" },
            { title: "OVA", value: "OVA" },
            { title: "双语", value: "雙語" },
            { title: "泡面番", value: "泡麵番" },
            { title: "真人演出", value: "真人演出" }
          ]
        },
        {
          name: "target",
          title: "对象",
          type: "enumeration",
          value: "全部",
          enumOptions: [
            { title: "全部", value: "全部" },
            { title: "合家观赏", value: "闔家觀賞" },
            { title: "付费会员", value: "付費會員" },
            { title: "年龄限制", value: "年齡限制" }
          ]
        },
        { name: "page", title: "页码", type: "page", startPage: 1 },
        { name: "language", title: "语言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

const ANI_ORIGIN = "https://ani.gamer.com.tw";
const SORTS = ["1", "2"];
const TAGS = ["全部", "動作", "冒險", "奇幻", "異世界", "科幻", "校園", "喜劇", "戀愛", "懸疑", "運動", "特攝", "BL", "GL"];
const CATEGORIES = ["全部", "電影", "OVA", "雙語", "泡麵番", "真人演出"];
const TARGETS = ["全部", "闔家觀賞", "付費會員", "年齡限制"];
const MEMORY_CACHE = {};

function selected(value, allowed, fallback) {
  const text = String(value || fallback);
  return allowed.includes(text) ? text : fallback;
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/第[一二三四五六七八九十百\d]+季/g, "")
    .replace(/Season\s*\d+/ig, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(value) {
  return cleanTitle(value).toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, "");
}

function parseYear(value) {
  const match = String(value || "").match(/(19\d{2}|20\d{2})/);
  return match ? match[1] : "";
}

function parseAniGamer(html) {
  const $ = Widget.html.load(html);
  const items = [];
  $('a.theme-list-main[href^="animeRef.php?sn="]').each((_, element) => {
    const node = $(element);
    const href = String(node.attr("href") || "");
    const sn = (href.match(/sn=(\d+)/) || [])[1];
    const title = node.find(".theme-name").text().trim();
    if (!sn || !title) return;
    const label = node.find(".anime-label-block").text().trim();
    items.push({
      sn,
      title,
      year: parseYear(node.find(".theme-time").text()),
      mediaHint: /電影/.test(label) ? "movie" : ""
    });
  });
  return items;
}

async function readCache(key) {
  if (MEMORY_CACHE[key]) return MEMORY_CACHE[key];
  if (!Widget.storage || typeof Widget.storage.get !== "function") return null;
  try {
    const value = await Widget.storage.get(key);
    if (!value) return null;
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && parsed.id && ["movie", "tv"].includes(parsed.mediaType)) {
      MEMORY_CACHE[key] = parsed;
      return parsed;
    }
  } catch (error) {}
  return null;
}

async function writeCache(key, value) {
  MEMORY_CACHE[key] = value;
  if (!Widget.storage || typeof Widget.storage.set !== "function") return;
  try { await Widget.storage.set(key, JSON.stringify(value)); } catch (error) {}
}

function candidateName(candidate) {
  return candidate.name || candidate.title || candidate.original_name || candidate.original_title || "";
}

async function searchType(item, mediaType, withYear) {
  const params = { query: cleanTitle(item.title), language: "zh-TW", include_adult: false };
  if (withYear && item.year) params[mediaType === "movie" ? "year" : "first_air_date_year"] = item.year;
  const data = await Widget.tmdb.get(`search/${mediaType}`, { params });
  const target = titleKey(item.title);
  const exact = (data && data.results || []).filter(candidate => titleKey(candidateName(candidate)) === target);
  const candidates = exact.length ? exact : (data && data.results || []).filter(candidate => {
    const key = titleKey(candidateName(candidate));
    return target.length >= 4 && (target.includes(key) || key.includes(target));
  });
  if (!candidates.length) return null;
  if (item.year) {
    const dated = candidates.find(candidate => String(candidate.release_date || candidate.first_air_date || "").startsWith(item.year));
    if (dated) return { id: dated.id, mediaType };
    if (withYear) return null;
  }
  return { id: candidates[0].id, mediaType };
}

async function resolveTmdb(item, forcedType) {
  const cacheKey = `anigamer:v1:${item.sn}:${item.year}:${forcedType || "all"}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;
  const types = forcedType ? [forcedType] : (item.mediaHint ? [item.mediaHint] : ["tv", "movie"]);
  for (const mediaType of types) {
    let match = await searchType(item, mediaType, true);
    if (!match && item.year) match = await searchType(item, mediaType, false);
    if (match) {
      await writeCache(cacheKey, match);
      return match;
    }
  }
  return null;
}

loadAniGamer = async function loadAniGamer(params = {}) {
  try {
    const sort = selected(params.sort, SORTS, "2");
    const tag = selected(params.tag, TAGS, "全部");
    const category = selected(params.category, CATEGORIES, "全部");
    const target = selected(params.target, TARGETS, "全部");
    const page = Math.min(69, Math.max(1, Number(params.page) || 1));
    const url = `${ANI_ORIGIN}/animeList.php?tags=${encodeURIComponent(tag)}&category=${encodeURIComponent(category)}&target=${encodeURIComponent(target)}&sort=${sort}&page=${page}`;
    const response = await Widget.http.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        Referer: `${ANI_ORIGIN}/animeList.php`
      }
    });
    const html = response && response.data;
    if (typeof html !== "string" || !html) throw new Error("动画疯返回空页面，请确认台湾代理分流");
    const sourceItems = parseAniGamer(html);
    const forcedType = category === "電影" ? "movie" : "";
    const resolved = [];
    for (let index = 0; index < sourceItems.length; index += 6) {
      const chunk = sourceItems.slice(index, index + 6);
      resolved.push(...await Promise.all(chunk.map(item => resolveTmdb(item, forcedType))));
    }
    const seen = new Set();
    return resolved.filter(Boolean).map(item => ({ id: `${item.mediaType}.${item.id}`, type: "tmdb" })).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch (error) {
    console.error("[loadAniGamer] 失败:", error.message || error);
    throw error;
  }
};
