const fs = require("fs");
const assert = require("assert/strict");

const source = fs.readFileSync("./MakkaPakka-ALL.js", "utf8");
const OVERVIEW = "TMDB 官方简介";
const movie = {
  id: 101,
  title: "TMDB 电影",
  original_title: "Official Movie",
  overview: OVERVIEW,
  release_date: "2026-01-02",
  poster_path: "/movie.jpg",
  backdrop_path: "/movie-back.jpg",
  vote_average: 8.1,
  genre_ids: [18, 16],
  popularity: 100
};
const show = {
  id: 202,
  name: "TMDB 剧集",
  original_name: "Official Show",
  overview: OVERVIEW,
  first_air_date: "2026-02-03",
  poster_path: "/show.jpg",
  backdrop_path: "/show-back.jpg",
  vote_average: 8.2,
  genre_ids: [16, 18],
  popularity: 90,
  genres: [{ id: 16 }, { id: 18 }]
};

global.Widget = {
  tmdb: {
    get: async (path) => {
      if (String(path).includes("/tv") || String(path).includes("search/tv") || String(path).includes("discover/tv")) {
        return String(path).match(/\/tv\/\d+/) ? show : { results: [show] };
      }
      return String(path).match(/\/movie\/\d+/) ? movie : { results: [movie] };
    }
  },
  http: {
    get: async (url) => {
      if (url.includes("api.trakt.tv")) return { data: [{ movie: { title: "来源电影", ids: { tmdb: 101 } }, watchers: 999 }] };
      if (url.includes("bangumi-hot.json")) return { data: { hot_anime: [{ id: 202, tmdbId: 202, mediaType: "tv", title: "TMDB 剧集", description: OVERVIEW }] } };
      if (url.includes("douban.com")) return { data: { subjects: [{ id: "db1", title: "Official Movie", rate: "9.9", cover: "https://source.invalid/poster.jpg" }] } };
      return { data: "" };
    },
    post: async () => ({ data: { data: { Page: { media: [] } } } })
  },
  html: { load: () => { throw new Error("HTML parser should not be used in this test"); } }
};

eval(source);

function official(item, label) {
  assert.ok(item, `${label} should return an item`);
  assert.equal(item.description, OVERVIEW, `${label} must use TMDB overview only`);
}

(async () => {
  assert.equal(WidgetMetadata.version, "1.4.0");
  assert.ok(WidgetMetadata.globalParams.some(param => param.type === "language"));
  official(buildItem({ id: 1, tmdbId: 1, type: "movie", title: "测试", date: "2026", subTitle: "⭐ 10", desc: OVERVIEW }), "buildItem");
  official(movie_buildItem(movie), "movie_buildItem");
  official((await fetchGenreRankData("movie", "all", "all", "popularity", 1))[0], "fetchGenreRankData");
  official(await searchRtTmdb({ title: "Official Movie", mediaType: "movie", tomatoScore: "99", popcornScore: "98" }, 1), "searchRtTmdb");
  official(buildImdbItem(movie, "movie"), "buildImdbItem");
  official((await handleTraktList("trending", "movies", "client", 1))[0], "handleTraktList");
  official((await fetchDoubanAndMap("热门", "movie", 1))[0], "fetchDoubanAndMap");
  official((await loadPlatformMatrixData("movie", { page: 1 }))[0], "loadPlatformMatrixData");
  official(await searchTmdbForTop10("Official Movie", "movie", 1), "searchTmdbForTop10");
  official((await fetchTmdbFallback_Top10("netflix", "united-states", "movie"))[0], "fetchTmdbFallback_Top10");
  official((await sanitizeAndEnsureTmdb([{ name_cn: "Official Show", title: "Official Show", releaseDate: "2026" }]))[0], "sanitizeAndEnsureTmdb");
  official((await fetchRecentHot({ page: 1 }))[0], "fetchRecentHot");

  assert.deepEqual(await routeAnimeOmni({ anime_source: "tmdb" }), [{ id: "tv.202", type: "tmdb" }]);
  assert.deepEqual(await loadGenreRank({ sort_by: "movie", genre: "all", region: "all", order_rule: "popularity" }), [{ id: "movie.101", type: "tmdb" }]);
  assert.deepEqual(await routeMovieOmni({ movie_source: "general" }), [{ id: "movie.101", type: "tmdb" }]);
  assert.deepEqual(await loadVarietyShows({ sort_by: "all", list_type: "hot" }), [{ id: "tv.202", type: "tmdb" }]);
  assert.deepEqual(await routeTrendsHub({ hub_source: "imdb", imdb_sort: "popular", mediaType: "movie" }), [{ id: "movie.101", type: "tmdb" }]);
  assert.deepEqual(await loadPlatformMatrix({ sort_by: "movie", platform: "213" }), [{ id: "movie.101", type: "tmdb" }]);
  assert.deepEqual(await loadOfficialTop10({ sort_by: "united-states", platform: "netflix", mediaType: "movie" }), [{ id: "movie.101", type: "tmdb" }]);

  for (const pattern of [/description:\s*`TOP /, /description:\s*`豆瓣 /, /description:\s*`电影\\n/, /description:\s*`\$\{date\}\\n/]) {
    assert.equal(pattern.test(source), false, `custom description remains: ${pattern}`);
  }
  console.log("MakkaPakka-ALL official overview tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
