const fs = require("fs");
const assert = require("assert/strict");
const { load } = require("cheerio");

const html = `
<div class="theme-list-block">
  <a class="theme-list-main" href="animeRef.php?sn=114209">
    <div class="anime-label-block"></div>
    <p class="theme-name">學生會也有洞！</p>
    <p class="theme-time">年份：2026/10</p>
  </a>
  <a class="theme-list-main" href="animeRef.php?sn=999">
    <div class="anime-label-block"></div>
    <p class="theme-name">無法匹配</p>
    <p class="theme-time">年份：2026/01</p>
  </a>
</div>`;

const calls = [];
const storage = {};
global.Widget = {
  http: {
    get: async (url) => {
      calls.push({ kind: "http", url });
      return { data: html };
    }
  },
  tmdb: {
    get: async (path, options) => {
      calls.push({ kind: "tmdb", path, options });
      if (options.params.query === "學生會也有洞！") return { results: [{ id: 202, name: "學生會也有洞！", first_air_date: "2026-10-01" }] };
      return { results: [] };
    }
  },
  html: { load },
  storage: {
    get: async key => storage[key],
    set: async (key, value) => { storage[key] = value; }
  }
};

global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/anigamer.js", "utf8"));

(async () => {
  assert.equal(WidgetMetadata.id, "makka.anigamer.popular");
  assert.equal(WidgetMetadata.modules[0].requiresWebView, false);
  assert.ok(WidgetMetadata.modules[0].params.some(param => param.type === "language"));

  const first = await loadAniGamer({ sort: "2", tag: "全部", category: "全部", target: "全部", page: 2 });
  assert.deepEqual(first, [{ id: "tv.202", type: "tmdb" }]);
  assert.match(calls[0].url, /^https:\/\/ani\.gamer\.com\.tw\/animeList\.php\?/);
  assert.match(calls[0].url, /sort=2&page=2$/);
  assert.equal(Object.keys(first[0]).sort().join(","), "id,type");

  const tmdbCalls = calls.filter(call => call.kind === "tmdb").length;
  await loadAniGamer({ sort: "2", tag: "全部", category: "全部", target: "全部", page: 2 });
  assert.equal(calls.filter(call => call.kind === "tmdb").length, tmdbCalls + 4, "cached match should not repeat; unmatched item retries both media types");

  console.log("AniGamer widget tests passed", { calls: calls.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
