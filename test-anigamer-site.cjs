const fs = require("fs");
const assert = require("assert/strict");

const calls = [];
const storage = new Map();

const indexBody = {
  data: {
    newAnime: {
      date: [
        { animeSn: "114197", title: "冰劍的魔術師 2", cover: "https://p2/b.jpg", acgCover: "https://p2/a.jpg", upTime: "11/06", totalEpisode: "5", info: "上架日：11/06" },
        { animeSn: "114197", title: "重複項", cover: "https://p2/b.jpg" }
      ],
      popular: [{ animeSn: "114209", title: "學生會也有洞！", cover: "https://p2/c.jpg", totalEpisode: "5" }]
    },
    hotAnime: [{ animeSn: "76284", title: "流浪神差", cover: "https://p2/d.jpg", info: "年份：2015/10 共 13 集", score: 4 }],
    newAdded: [{ animeSn: "71234", title: "青年黑傑克", cover: "https://p2/e.jpg", info: "上架日：11/06 共 12 集" }],
    category: [{ title: "競速特輯", intro: "", list: [{ animeSn: "98172", title: "強風吹拂", cover: "https://p2/f.jpg", info: "年份：2018/10 共 23 集" }] }]
  }
};

const listHtml = `
<div class="theme-list-block">
  <a href='animeRef.php?sn=114188' class='theme-list-main'>
    <img class='theme-img lazyload' data-src='https://p2/cover.jpg' alt='闇機'>
    <div class='btn-card-block' onclick='animefun.toggleGather(148362, 114188, $(this), "x"); return false;'></div>
    <div class='show-view-number'><p>2.6萬</p></div>
    <p class='theme-name'>闇機 DARK MACHINE</p>
    <p class='theme-time'>年份：2026/10</p>
    <span class='theme-number'>共4集</span>
  </a>
</div>`;

const detailBody = {
  data: {
    video: { videoSn: 51930, cover: "https://p2/v.jpg" },
    anime: {
      animeSn: 114188,
      title: "闇機 DARK MACHINE [1]",
      totalEpisode: 4,
      seasonStart: "2026/10/14",
      tags: ["科幻", "懸疑"],
      score: 3.6,
      contentHtml: "<p>簡介<br>第二行</p>",
      cover: "https://p2/a.jpg",
      episodes: {
        0: [
          { episode: 1, videoSn: 51930, cover: "https://p2/e1.jpg" },
          { episode: 2, videoSn: 51931, cover: "https://p2/e2.jpg" }
        ],
        3: [{ episode: 1, videoSn: 60001, cover: "https://p2/e1c.jpg" }],
        6: [{ episode: 1, videoSn: 60001, cover: "https://p2/e1d.jpg" }]
      }
    },
    relatedAnime: [{ animeSn: 113743, title: "劇場總集篇", cover: "https://p2/r.jpg", totalEpisode: 1 }]
  }
};

let unlockUp = false;
const CACHE_PREFIX = "anigamer:play";

global.Widget = {
  http: {
    get: async (url, options) => {
      calls.push({ url, headers: (options && options.headers) || {} });
      if (url.includes("/anime/v1/index.php")) return { data: indexBody, statusCode: 200, headers: {} };
      if (url.includes("/anime/v1/search.php")) {
        return { data: { data: { animeList: [{ animeSn: 113142, title: "孤獨搖滾！", cover: "https://p2/g.jpg", dateInfo: "年份：2022/10" }] } }, statusCode: 200, headers: {} };
      }
      if (url.includes("/anime/v1/video.php?animeSn=114188")) return { data: detailBody, statusCode: 200, headers: {} };
      if (url.includes("/anime/v1/video.php?videoSn=51930")) return { data: detailBody, statusCode: 200, headers: {} };
      if (url.endsWith("/animeList.php?page=1&tags=%E5%85%A8%E9%83%A8&category=%E5%85%A8%E9%83%A8&target=%E5%85%A8%E9%83%A8&sort=1")) {
        return { data: listHtml, statusCode: 200, headers: {} };
      }
      if (url.includes("getdeviceid.php")) {
        return {
          data: { deviceid: "abc123" },
          statusCode: 200,
          headers: { "set-cookie": "ANIME_SIGN=sig1; path=/, nologinuser=anon1; path=/, ANIME_SIGN=sig2; path=/" }
        };
      }
      if (url.includes("animeVideo2.js")) return { data: 'var adlist = [["123533","x","286610","video"]];', statusCode: 200, headers: {} };
      if (url.includes("videoCastcishu.php")) return { data: "", statusCode: 200, headers: {} };
      if (url.includes("video_src.php")) {
        if (!unlockUp) return { data: { error: { code: 1015 } }, statusCode: 299, headers: {} };
        return { data: { data: { srcUseCases: [{ deviceType: 1, src: { playlist: "https://cdn/playlist_guest.m3u8?hdnts=1" } }] } }, statusCode: 200, headers: {} };
      }
      if (url.startsWith("https://cdn/playlist_guest.m3u8")) {
        return {
          data: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360\n360p/chunklist.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\n720p/chunklist.m3u8\n',
          statusCode: 200,
          headers: {}
        };
      }
      throw new Error("unmocked url: " + url);
    }
  },
  html: { load: (html) => require("/opt/project1/node_modules/cheerio").load(html) },
  storage: {
    get: async (key) => storage.get(key) || null,
    set: async (key, value) => { storage.set(key, value); },
    remove: async (key) => { storage.delete(key); }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(process.argv[2] || "./widgets/anigamer-site.js", "utf8"));
const noSleep = () => { unlockUp = true; };

(async () => {
  assert.equal(WidgetMetadata.id, "makka.anigamer.site");
  assert.equal(WidgetMetadata.modules.find(m => m.id === "loadResource").type, "stream");

  const recent = await loadRecent({ page: 1 });
  assert.equal(recent.length, 1, "recent should dedupe duplicate animeSn");
  assert.equal(recent[0].id, "anigamer:anime:114197");
  assert.equal(recent[0].type, "url");
  assert.equal(recent[0].posterPath, "https://p2/a.jpg");
  assert.equal(recent[0].backdropPath, "https://p2/b.jpg");
  assert.equal(recent[0].mediaType, "tv");
  assert.ok(!("image" in recent[0]) && !("customHeaders" in recent[0]), "no non-standard fields");

  const popular = await loadSeasonPopular({ page: 1 });
  assert.equal(popular[0].id, "anigamer:anime:114209");

  const hot = await loadHot({ page: 1 });
  assert.equal(hot[0].rating, "4");
  assert.equal(hot[0].releaseDate, "");
  assert.equal(hot[0].mediaType, "tv");

  const added = await loadNewAdded({ page: 1 });
  assert.equal(added[0].mediaType, "tv");

  const themes = await loadThemes({ page: 1 });
  assert.equal(themes[0].title, "強風吹拂");
  assert.ok(themes[0].description.includes("競速特輯"));

  const catalog = await loadCatalog({ tag: "全部", category: "全部", target: "全部", sort: "1", page: 1 });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, "anigamer:anime:114188");
  assert.equal(catalog[0].mediaType, "tv");
  assert.equal(catalog[0].title, "闇機 DARK MACHINE");
  assert.ok(catalog[0].description.includes("2.6萬"));

  const search = await searchAnime({ keyword: "孤獨", page: 1 });
  assert.equal(search[0].id, "anigamer:anime:113142");

  const detail = await loadDetail("anigamer:anime:114188");
  assert.equal(detail.id, "anigamer:anime:114188");
  assert.equal(detail.title, "闇機 DARK MACHINE");
  assert.equal(detail.mediaType, "tv");
  assert.equal(detail.genreTitle, "科幻 · 懸疑");
  assert.equal(detail.description, "簡介\n第二行");
  assert.equal(detail.episodeItems.length, 3, "episodes deduped by videoSn across volumes");
  assert.equal(detail.episodeItems[2].title, "第 1 集（中文配音）");
  assert.equal(detail.relatedItems.length, 1);
  assert.equal(detail.relatedItems[0].mediaType, "movie");

  const episodeDetail = await loadDetail("anigamer:episode:114188:51931");
  assert.ok(episodeDetail.title.includes("第 2 集"));
  assert.equal(episodeDetail.episode, 2);

  assert.equal(await loadDetail("https://evil.example.com/x"), null);
  assert.equal(await loadDetail("anigamer:anime:notanumber"), null);

  // guest unlock: no cookie, 1015 until unlocked
  const origSleep = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };
  unlockUp = true;
  const srcCall = calls.length;
  let resources = await loadResource({ link: "anigamer:episode:114188:51930" });
  assert.equal(resources.length, 2, "should expose both variants");
  assert.equal(resources[0].name, "動畫瘋 720P", "sorted high to low");
  assert.equal(resources[0].customHeaders.Origin, "https://ani.gamer.com.tw");
  assert.equal(resources[0].customHeaders.Referer, "https://ani.gamer.com.tw/");
  assert.equal(resources[0].playerType, "app");
  global.setTimeout = origSleep;

  const unlockUrls = calls.slice(srcCall).map(c => c.url);
  assert.ok(unlockUrls.some(u => u.includes("videoCastcishu.php?s=286610&sn=51930&ad=end")), "must close the ad window");
  const srcReq = calls.slice(srcCall).find(c => c.url.includes("video_src.php"));
  assert.ok(srcReq.url.includes("deviceid=abc123"));
  const castReq = calls.slice(srcCall).find(c => c.url.includes("videoCastcishu.php") && !c.url.includes("ad=end"));
  assert.ok(castReq.headers.Cookie.includes("nologinuser=anon1"), "device cookie attached");
  assert.ok(castReq.headers.Cookie.includes("ANIME_SIGN=sig2"), "last ANIME_SIGN wins");
  assert.ok(!castReq.headers.Cookie.includes("sig1"), "stale ANIME_SIGN dropped");

  // logged-in cookie must be merged with the device cookie, not dropped
  const userStart = calls.length;
  const userResources = await loadResource({
    link: "anigamer:episode:114188:51930",
    cookie: "BAHAID=user1; BAHAREF=ref1"
  });
  assert.equal(userResources.length, 2);
  assert.ok(userResources[0].description.includes("已登入"), "description marks logged-in source");
  const userCast = calls.slice(userStart).find(c => c.url.includes("videoCastcishu.php") && !c.url.includes("ad=end"));
  assert.ok(userCast.headers.Cookie.includes("BAHAID=user1"), "account cookie forwarded");
  assert.ok(userCast.headers.Cookie.includes("BAHAREF=ref1"), "all account cookie pairs forwarded");
  assert.ok(userCast.headers.Cookie.includes("nologinuser="), "device cookie still merged in");

  const guestSrc = calls.slice(srcCall).find(c => c.url.includes("video_src.php"));
  assert.ok(guestSrc.headers.Cookie.includes("nologinuser=anon1"), "guest request has no account cookie");
  assert.ok(!guestSrc.headers.Cookie.includes("BAHAID="), "guest request must not leak account cookie");

  // wrong source must not resolve
  const before = calls.length;
  assert.deepEqual(await loadResource({ id: "tmdb", title: "孤獨搖滾" }), []);
  assert.equal(calls.length, before, "unrelated input makes no requests");

  console.log("AniGamer site widget tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
