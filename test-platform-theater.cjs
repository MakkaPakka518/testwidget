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

function official(result, label) {
  assert.equal(result.length, 1, `${label} count`);
  const value = result[0];
  assert.equal(value.id, 101);
  assert.equal(value.type, "tmdb");
  assert.equal(value.title, "TMDB 中文标题");
  assert.equal(value.description, OVERVIEW);
  assert.equal(value.rank, undefined);
  assert.equal(value.heat, undefined);
  assert.equal(value.popularity, undefined);
  assert.equal(value.voteCount, undefined);
}

(async () => {
  assert.equal(WidgetMetadata.version, "1.1.0");
  assert.equal(WidgetMetadata.modules.length, 5);
  assert.equal(WidgetMetadata.modules[4].functionName, "loadFlixPatrol");

  official(await loadDouban({ channel: "tv" }), "Douban");
  official(await loadTheater({ brand: "迷雾剧场", status: "aired" }), "Theater");
  official(await loadBangumi({ genre: "16" }), "Bangumi");
  official(await loadMangoTV({ sort_by: "tv" }), "MangoTV");
  official(await loadFlixPatrol({ country: "world", platform: "netflix", chart: "movies" }), "FlixPatrol");

  console.log("Platform theater official overview tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
