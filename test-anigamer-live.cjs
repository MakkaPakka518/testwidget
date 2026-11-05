const fs = require("fs");
const assert = require("assert/strict");

global.Widget = {
  http: {
    get: async (url, options) => {
      const response = await fetch(url, { headers: options && options.headers });
      assert.equal(response.status, 200, `HTTP ${response.status}: ${url}`);
      return { data: await response.json() };
    }
  },
  tmdb: { get: async () => { throw new Error("ID-only module must not request TMDB"); } }
};

global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/anigamer.js", "utf8"));

(async () => {
  const items = await loadAniGamer({ sort: "monthly", page: 1 });
  assert.ok(items.length > 0);
  assert.ok(items.every(item => item.type === "tmdb" && /^(movie|tv)\.\d+$/.test(item.id)));
  assert.ok(items.every(item => Object.keys(item).sort().join(",") === "id,type"));
  const movies = await loadAniGamer({ sort: "monthly", filter: "categories", category: "電影", page: 1 });
  assert.ok(movies.length > 0);
  assert.ok(movies.every(item => /^movie\.\d+$/.test(item.id)));
  console.log("AniGamer live data test passed", { items: items.length, movies: movies.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
