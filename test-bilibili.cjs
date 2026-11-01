const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/bilibili.js";
const calls = [];

const VIEW = {
  bvid: "BV1Nax16uEHm",
  aid: 117535085169383,
  title: "测试视频",
  pic: "//i2.hdslb.com/bfs/archive/x.jpg",
  pubdate: 1793443764,
  duration: 742,
  tname: "设计·创意",
  desc: "描述文本",
  owner: { mid: 946974, name: "影视飓风", face: "//i0.hdslb.com/face.jpg" },
  stat: { view: 1234567, danmaku: 8901 },
  pages: [
    { cid: 43208346540, part: "P1 正片", duration: 742 },
    { cid: 43208346541, part: "P2 花絮", duration: 120 }
  ]
};

const PLAYURL = {
  quality: 64,
  format: "flv720",
  durl: [{ url: "https://upos.example/1.m4s" }],
  dash: {
    duration: 742,
    video: [
      { id: 80, baseUrl: "https://upos.example/1080.m4s", bandwidth: 3000000 },
      { id: 64, baseUrl: "https://upos.example/720.m4s", bandwidth: 1500000 }
    ],
    audio: [
      { id: 30280, baseUrl: "https://upos.example/audio.m4s", bandwidth: 128000 }
    ]
  }
};

function ok(data) { return { data: { code: 0, message: "OK", data } }; }

global.Widget = {
  http: {
    get: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/x/frontend/finger/spi")) return ok({ b_3: "BUVID3-TEST" });
      if (url.endsWith("/x/web-interface/nav")) {
        return ok({ isLogin: false, wbi_img: {
          img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
          sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"
        } });
      }
      if (url.endsWith("/x/web-interface/popular")) return ok({ list: [VIEW] });
      if (url.endsWith("/x/web-interface/ranking/v2")) return ok({ list: [VIEW] });
      if (url.endsWith("/x/web-interface/view")) {
        const bvid = options.params && options.params.bvid;
        if (bvid !== VIEW.bvid) return { data: { code: -404, message: "啥都木有" } };
        return ok(VIEW);
      }
      if (url.endsWith("/x/web-interface/search/type")) {
        return ok({ result: [{ bvid: VIEW.bvid, title: '<em class="keyword">测试</em>视频', pic: "//x.jpg", mid: 1, author: "UP", play: 100, video_review: 2, duration: "12:22", pubdate: 1793443764, typename: "生活", description: "" }] });
      }
      if (url.endsWith("/x/space/wbi/arc/search")) {
        return ok({ list: { vlist: [{ bvid: VIEW.bvid, title: "投稿视频", pic: "//x.jpg", author: "UP", play: 10, video_review: 1, length: "10:00", created: 1793443764, description: "" }] } });
      }
      if (url.endsWith("/x/player/playurl")) {
        return ok(PLAYURL);
      }
      throw new Error("unmocked url " + url);
    }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  const popular = await loadPopular({ count: "20" });
  assert.equal(popular.length, 1);
  assert.equal(popular[0].type, "url");
  assert.equal(popular[0].id, "https://www.bilibili.com/video/BV1Nax16uEHm");
  assert.equal(popular[0].link, "bili:video:BV1Nax16uEHm:43208346540", "多P默认指向P1");
  assert.equal(popular[0].videoUrl, undefined, "列表不得缓存播放地址");
  assert.equal(popular[0].durationText, "12:22");
  assert.equal(popular[0].peoples[0].id, "946974");
  assert.equal(popular[0].episodeItems.length, 2, "多P应生成分集");
  assert.ok(popular[0].coverUrl.startsWith("https://"), "协议相对地址必须补全");

  const spiCall = calls.find((c) => c.url.endsWith("/x/frontend/finger/spi"));
  assert.ok(spiCall, "必须获取 buvid3");
  const popCall = calls.find((c) => c.url.endsWith("/x/web-interface/popular"));
  assert.ok(popCall.options.headers.Cookie.includes("buvid3="), "请求需携带 buvid3");

  const ranking = await loadRanking({ category: "4", count: "5" });
  assert.equal(ranking.length, 1);
  assert.equal(calls.find((c) => c.url.endsWith("/x/web-interface/ranking/v2")).options.params.rid, "4");

  const detail = await loadDetail("bili:video:BV1Nax16uEHm:43208346541");
  assert.equal(detail.episode, 2, "带 cid 的链接应定位到 P2");

  const resources = await loadResource({ link: "bili:video:BV1Nax16uEHm:43208346540" });
  assert.equal(resources.length, 3, "2 视频轨去重 + 1 音轨");
  assert.equal(resources[0].name, "1080P");
  assert.equal(resources[1].name, "720P");
  assert.equal(resources[2].name, "音轨");
  assert.equal(resources[0].playerType, "app");
  const playCall = calls.find((c) => c.url.endsWith("/x/player/playurl"));
  assert.equal(playCall.options.params.cid, "43208346540");


  const searched = await search({ keyword: "猫" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].title, "测试视频", "搜索结果需去除高亮标签");

  const byBv = await search({ keyword: "BV1Nax16uEHm" });
  assert.equal(byBv.length, 1);

  const uploader = await loadUploader({ mid: "946974" });
  assert.equal(uploader.length, 1);
  const arcCall = calls.find((c) => c.url.endsWith("/x/space/wbi/arc/search"));
  assert.ok(arcCall.options.params.w_rid, "UP主接口必须带 w_rid 签名");
  assert.ok(arcCall.options.params.wts, "UP主接口必须带 wts");

  assert.equal(await loadDetail("bili:bvid:BV0000000000"), null);
  assert.deepEqual(await loadResource({ link: "https://evil.test/video/BV1Nax16uEHm", id: "bili:bvid:BV1Nax16uEHm" }), []);

  console.log("Bilibili widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
