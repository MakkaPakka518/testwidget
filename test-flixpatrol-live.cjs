const fs = require("fs");
const assert = require("assert/strict");

const calls = [];
global.Widget = {
  http: {
    get: async (url, options) => {
      calls.push({ url, options });
      const response = await fetch(url, { headers: options && options.headers });
      assert.equal(response.status, 200, `HTTP ${response.status}: ${url}`);
      return { data: await response.json() };
    }
  },
  tmdb: { get: async () => ({ results: [] }) }
};
global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/flixpatrol.js", "utf8"));

(async () => {
  const items = await loadFlixPatrol({ country: "united-states", platform: "netflix", category: "movies", count: "10" });
  assert.equal(items.length, 10);
  assert.equal(items[0].type, "url");
  assert.match(items[0].link, /^https:\/\/flixpatrol\.com\/title\//);
  assert.match(items[0].description, /#1 · Netflix · 电影 · United States/);
  assert.equal(calls[0].url, "https://raw.githubusercontent.com/MakkaPakka518/List/main/data/flixpatrol/united-states.json");
  console.log("FlixPatrol live data test passed", { items: items.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
