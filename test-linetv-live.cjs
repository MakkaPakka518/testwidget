const fs = require("fs");
const assert = require("assert/strict");

global.Widget = {
  http: {
    get: async (url, options) => {
      const response = await fetch(url, { headers: options && options.headers });
      return { data: await response.text(), statusCode: response.status };
    },
    post: async (url, body, options) => {
      const response = await fetch(url, { method: "POST", headers: options && options.headers, body: JSON.stringify(body) });
      return { data: await response.text(), statusCode: response.status };
    }
  },
  storage: { get: async () => null, set: async () => {} }
};

global.WidgetMetadata = {};
eval(fs.readFileSync("./widgets/linetv.js", "utf8"));

(async () => {
  const top = await loadLineTv({ source: "top10", page: 1 });
  assert.ok(top.length >= 10);
  assert.ok(top.every(item => item.type === "url" && /^linetv:drama:\d+$/.test(item.id)));

  const detail = await loadDetail(top[0].link);
  assert.ok(detail && detail.title);
  assert.ok(Array.isArray(detail.episodeItems));

  const geo = await (await fetch("https://www.linetv.tw/api/geo")).json();
  let playback = [];
  if (geo.country === "TW" && detail.episodeItems.length) {
    playback = await loadResource({ link: detail.episodeItems[0].link });
    assert.ok(playback.length > 0);
  }
  console.log("LINE TV live test passed", { top: top.length, episodes: detail.episodeItems.length, country: geo.country, playback: playback.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
