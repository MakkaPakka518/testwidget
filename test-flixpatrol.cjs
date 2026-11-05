const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/flixpatrol.js";

const calls = [];
const DATA = {
  schemaVersion: 1,
  chartDate: "2026-11-05",
  country: { slug: "united-states", name: "United States" },
  platforms: {
    netflix: {
      name: "Netflix",
      charts: {
        movies: [
          { rank: 1, title: "Test Movie", sourcePath: "/title/test-movie-2026/", movement: "+1", days: "2 d", mediaType: "movie", tmdbId: 101, tmdbTitle: "测试电影", posterPath: "/movie.jpg", backdropPath: "/back.jpg", releaseDate: "2026-01-02", rating: 8.1, description: "TMDB 原生简介" },
          { rank: 2, title: "Unknown Film", sourcePath: "/title/unknown-film/", movement: "–", days: "1 d", mediaType: "movie" }
        ],
        tv: [{ rank: 1, title: "Test Show", sourcePath: "/title/test-show/", movement: "", days: "3 d", mediaType: "tv", tmdbId: 202 }]
      }
    },
    disney: {
      name: "Disney+",
      charts: { movies: [{ rank: 1, title: "Test Movie", sourcePath: "/title/test-movie-2026/", movement: "", days: "4 d", mediaType: "movie" }] }
    }
  }
};

global.Widget = {
  http: {
    get: async (url, options) => {
      calls.push({ kind: "http", url, options });
      return { data: DATA };
    }
  },
  tmdb: { get: async () => { throw new Error("ID-only module must not request TMDB"); } }
};
global.WidgetMetadata = {};
eval(fs.readFileSync(target, "utf8"));

(async () => {
  assert.equal(WidgetMetadata.id, "makka.flixpatrol.top10");
  assert.equal(WidgetMetadata.version, "1.1.0");
  assert.equal(WidgetMetadata.modules[0].functionName, "loadFlixPatrol");
  assert.ok(WidgetMetadata.modules[0].params.some(param => param.type === "language"));

  const movies = await loadFlixPatrol({ country: "united-states", platform: "netflix", category: "movies", count: "10" });
  assert.equal(calls[0].url, "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol/united-states.json");
  assert.deepEqual(movies, [{ id: "movie.101", type: "tmdb" }]);
  assert.equal(calls.filter(call => call.kind === "tmdb").length, 0);

  const mixed = await loadFlixPatrol({ country: "united-states", platform: "netflix", category: "all", count: "20" });
  assert.deepEqual(mixed, [{ id: "movie.101", type: "tmdb" }, { id: "tv.202", type: "tmdb" }]);

  const allPlatforms = await loadFlixPatrol({ country: "united-states", platform: "all", category: "movies", count: "10" });
  assert.deepEqual(allPlatforms, [{ id: "movie.101", type: "tmdb" }]);

  const beforeInvalid = calls.length;
  assert.deepEqual(await loadFlixPatrol({ country: "../../secret", platform: "netflix" }), []);
  assert.equal(calls.length, beforeInvalid, "非法国家不得发请求");

  console.log("FlixPatrol widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
