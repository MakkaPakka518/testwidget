const fs = require("fs");
const assert = require("assert/strict");

let id = 1000;
global.Widget = {
  http: {
    get: async (url, options) => {
      const response = await fetch(url, { headers: options && options.headers });
      assert.equal(response.status, 200, `HTTP ${response.status}: ${url}`);
      return { data: await response.json() };
    }
  },
  tmdb: {
    get: async (path, options) => ({ results: [{ id: ++id, name: options.params.query, first_air_date: `${options.params.first_air_date_year || 2026}-01-01` }] })
  },
  storage: { get: async () => null, set: async () => {} }
};

global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/linetv.js", "utf8"));

(async () => {
  const top = await loadLineTv({ source: "top10", page: 1 });
  const anime = await loadLineTv({ source: "anime", page: 1 });
  assert.ok(top.length >= 10);
  assert.ok(anime.length > 0);
  assert.ok([...top, ...anime].every(item => Object.keys(item).sort().join(",") === "id,type"));
  console.log("LINE TV live catalog test passed", { top: top.length, anime: anime.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
