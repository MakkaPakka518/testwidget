const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/linetv.js";

const top10 = [{ dramaId: 1, name: "测试剧", year: 2026, totalEps: 12, channelName: ["戲劇"] }];
const schedule = { title: "最新跟播", datas: [{ dramaId: 2, name: "测试动画", year: 2026, totalEps: 12, channelName: ["動畫"] }] };
const channels = [{ title: "动画跟播中", type: "album", datas: [{ dramaId: 3, name: "测试动画", year: 2026, totalEps: 12, channelName: ["動畫"] }] }];
const calls = [];
const storage = {};
global.Widget = {
  http: {
    get: async url => {
      calls.push({ kind: "http", url });
      if (url.includes("release-schedule")) return { data: schedule };
      if (url.includes("channels/")) return { data: channels };
      return { data: [{ title: "10 大热门节目", type: "top10", datas: top10 }] };
    }
  },
  tmdb: {
    get: async (path, options) => {
      calls.push({ kind: "tmdb", path, options });
      const id = options.params.query.includes("动画") ? 202 : 101;
      return { results: [{ id, name: options.params.query, first_air_date: "2026-01-01" }] };
    }
  },
  storage: {
    get: async key => storage[key],
    set: async (key, value) => { storage[key] = value; }
  }
};

global.WidgetMetadata = {};
eval(fs.readFileSync(target, "utf8"));

(async () => {
  assert.equal(WidgetMetadata.id, "makka.linetv.catalog");
  assert.ok(WidgetMetadata.modules[0].params.some(param => param.type === "language"));
  assert.deepEqual(await loadLineTv({ source: "top10", page: 1 }), [{ id: "tv.101", type: "tmdb" }]);
  assert.deepEqual(await loadLineTv({ source: "schedule", scheduleType: "動畫", page: 1 }), [{ id: "tv.202", type: "tmdb" }]);
  assert.deepEqual(await loadLineTv({ source: "anime", page: 1 }), [{ id: "tv.202", type: "tmdb" }]);
  assert.ok(calls.filter(call => call.kind === "http").every(call => call.url.startsWith("https://api.linetv.tw/v1/cms/")));
  assert.ok(calls.filter(call => call.kind === "tmdb").every(call => call.options.params.language === "zh-TW"));
  console.log("LINE TV widget tests passed", { calls: calls.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
