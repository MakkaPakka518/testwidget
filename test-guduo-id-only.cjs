const fs = require("fs");
const assert = require("assert/strict");

const data = {
  categories: {
    "剧集": [
      { tmdbId: 101, mediaType: "tv", title: "来源标题", description: "来源简介", posterPath: "/poster.jpg", rank: 1, heat: 999 },
      { title: "没有 TMDB ID" }
    ]
  }
};

global.Widget = {
  http: { get: async () => ({ data }) },
  tmdb: { get: async () => { throw new Error("ID-only module must not request TMDB"); } }
};

eval(fs.readFileSync("./骨朵热度指数榜.js", "utf8"));

(async () => {
  assert.equal(WidgetMetadata.version, "1.1.0");
  assert.ok(WidgetMetadata.modules[0].params.some(param => param.type === "language"));
  assert.deepEqual(await loadGuduoRank({ category: "剧集" }), [{ id: "tv.101", type: "tmdb" }]);
  console.log("Guduo ID-only tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
