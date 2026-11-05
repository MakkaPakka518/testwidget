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
          { rank: 1, title: "Test Movie", sourcePath: "/title/test-movie-2026/", movement: "+1", days: "2 d", mediaType: "movie" },
          { rank: 2, title: "Unknown Film", sourcePath: "/title/unknown-film/", movement: "–", days: "1 d", mediaType: "movie" }
        ],
        tv: [{ rank: 1, title: "Test Show", sourcePath: "/title/test-show/", movement: "", days: "3 d", mediaType: "tv" }]
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
  tmdb: {
    get: async (path, options) => {
      calls.push({ kind: "tmdb", path, options });
      if (options.params.query === "Test Movie") return { results: [{ id: 101, title: "Test Movie", release_date: "2026-01-02", poster_path: "/movie.jpg", backdrop_path: "/back.jpg", vote_average: 8.1, popularity: 10 }] };
      if (options.params.query === "Test Show") return { results: [{ id: 202, name: "Test Show", first_air_date: "2025-02-03", poster_path: "/show.jpg", media_type: "tv", popularity: 5 }] };
      return { results: [{ id: 999, title: "Wrong Title", popularity: 999 }] };
    }
  }
};
global.WidgetMetadata = {};
eval(fs.readFileSync(target, "utf8"));

(async () => {
  assert.equal(WidgetMetadata.id, "makka.flixpatrol.top10");
  assert.equal(WidgetMetadata.modules[0].functionName, "loadFlixPatrol");

  const movies = await loadFlixPatrol({ country: "united-states", platform: "netflix", category: "movies", count: "10" });
  assert.equal(calls[0].url, "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol/united-states.json");
  assert.equal(movies.length, 2);
  assert.deepEqual(movies[0], {
    id: 101,
    type: "tmdb",
    mediaType: "movie",
    title: "Test Movie",
    posterPath: "/movie.jpg",
    backdropPath: "/back.jpg",
    releaseDate: "2026-01-02",
    rating: 8.1,
    description: "#1 · Netflix · 电影 · United States · 2026-11-05 · 变化 +1 · 在榜 2 d"
  });
  assert.equal(movies[0].poster_path, undefined);
  assert.equal(movies[1].type, "url");
  assert.equal(movies[1].link, "https://flixpatrol.com/title/unknown-film/");

  const mixed = await loadFlixPatrol({ country: "united-states", platform: "netflix", category: "all", count: "20" });
  assert.equal(mixed.length, 3);
  assert.equal(mixed[2].mediaType, "tv");

  const allPlatforms = await loadFlixPatrol({ country: "united-states", platform: "all", category: "movies", count: "10" });
  assert.equal(allPlatforms.length, 3);
  assert.match(allPlatforms[2].description, /Disney\+/);

  const beforeInvalid = calls.length;
  assert.deepEqual(await loadFlixPatrol({ country: "../../secret", platform: "netflix" }), []);
  assert.equal(calls.length, beforeInvalid, "非法国家不得发请求");
  assert.equal(await loadDetail("https://evil.test/title/test/"), null);
  assert.equal((await loadDetail("https://flixpatrol.com/title/unknown-film/")).title, "Unknown Film");

  console.log("FlixPatrol widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
