const fs = require("fs");
const assert = require("assert/strict");

const data = {
  schemaVersion: 1,
  lists: {
    monthly: {
      "1": [
        { tmdbId: 202, mediaType: "tv", sourceTitle: "来源标题", posterPath: "/poster.jpg" },
        { sourceTitle: "未匹配" }
      ]
    },
    yearly: { "1": [{ tmdbId: 101, mediaType: "movie" }] }
  }
};
const calls = [];
let failureMode = false;
global.Widget = {
  http: {
    get: async url => {
      calls.push(url);
      if (url.endsWith("anigamer-status.json")) return { data: { ok: false, reason: "台湾代理认证失败" } };
      return { data: failureMode ? null : data };
    }
  },
  tmdb: { get: async () => { throw new Error("ID-only module must not request TMDB"); } }
};

global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/anigamer.js", "utf8"));

(async () => {
  assert.equal(WidgetMetadata.version, "1.1.0");
  assert.equal(WidgetMetadata.modules[0].requiresWebView, false);
  assert.ok(WidgetMetadata.modules[0].params.some(param => param.type === "language"));
  assert.deepEqual(await loadAniGamer({ sort: "monthly", page: 1 }), [{ id: "tv.202", type: "tmdb" }]);
  assert.deepEqual(await loadAniGamer({ sort: "yearly", page: 1 }), [{ id: "movie.101", type: "tmdb" }]);
  assert.equal(Object.keys((await loadAniGamer({ sort: "monthly", page: 1 }))[0]).sort().join(","), "id,type");
  assert.ok(calls[0].endsWith("/anigamer-hot.json"));

  failureMode = true;
  await assert.rejects(() => loadAniGamer({}), /台湾代理认证失败/);
  console.log("AniGamer GitHub widget tests passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
