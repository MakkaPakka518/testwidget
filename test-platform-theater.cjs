const fs = require("fs");
const assert = require("assert/strict");

const OVERVIEW = "TMDB 官方简介";
const item = {
  id: "101",
  tmdbId: 101,
  type: "tmdb",
  mediaType: "tv",
  title: "来源标题",
  tmdbTitle: "TMDB 中文标题",
  description: OVERVIEW,
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  releaseDate: "2026-01-02",
  rating: 8.1,
  genreTitle: "动画 / 剧情",
  rank: 1,
  heat: 999,
  popularity: 888,
  voteCount: 777
};

const responses = {
  "douban-hot.json": { tv: [item] },
  "theater-data.json": { "迷雾剧场": { aired: [item], upcoming: [] } },
  "bangumi-hot.json": { hot_anime: [item] },
  "mgtv-hot.json": { tv: [item], show: [] },
  "guduo-hot.json": { categories: { "剧集": [item] } },
  "anigamer-hot.json": { schemaVersion: 1, lists: { monthly: { "1": [item] }, yearly: { "1": [] } } },
  "flixpatrol/world.json": { platforms: { netflix: { charts: { movies: [item], tv: [item] } } } }
};

global.Widget = {
  http: {
    get: async url => {
      const key = Object.keys(responses).find(name => url.endsWith(name));
      if (!key) throw new Error(`unexpected URL: ${url}`);
      return { data: responses[key] };
    }
  }
};

eval(fs.readFileSync("./平台剧场.js", "utf8"));

function identity(result, label) {
  assert.equal(result.length, 1, `${label} count`);
  assert.deepEqual(result[0], { id: "tv.101", type: "tmdb" });
}

(async () => {
  assert.equal(WidgetMetadata.version, "1.3.0");
  assert.equal(WidgetMetadata.modules.length, 7);
  assert.equal(WidgetMetadata.modules[4].functionName, "loadFlixPatrol");
  assert.equal(WidgetMetadata.modules[5].functionName, "loadGuduo");
  assert.equal(WidgetMetadata.modules[6].functionName, "loadAniGamer");
  assert.ok(WidgetMetadata.modules.every(module => module.params.some(param => param.type === "language")));

  identity(await loadDouban({ channel: "tv" }), "Douban");
  identity(await loadTheater({ brand: "迷雾剧场", status: "aired" }), "Theater");
  identity(await loadBangumi({ genre: "16" }), "Bangumi");
  identity(await loadMangoTV({ sort_by: "tv" }), "MangoTV");
  identity(await loadFlixPatrol({ country: "world", platform: "netflix", chart: "movies" }), "FlixPatrol");
  identity(await loadGuduo({ category: "剧集" }), "Guduo");
  identity(await loadAniGamer({ sort: "monthly", page: 1 }), "AniGamer");

  console.log("Platform theater ID-only tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
