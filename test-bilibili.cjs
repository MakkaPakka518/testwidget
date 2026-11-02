const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/bilibili.js";
const calls = [];
const proxyCalls = [];

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

const VIEW_NAV = {
  isLogin: true,
  uname: "影视飓风",
  mid: 946974,
  wbi_img: {
    img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
    sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"
  }
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
      if (url.includes("/api/proxy")) {
        assert.equal(options.headers["X-Bili-Key"], "bk_" + "a".repeat(32), "必须携带登录 key");
        proxyCalls.push(options.params.url);
        const target = new URL(options.params.url);
        assert.ok(target.hostname === "api.bilibili.com", "代理目标必须是B站");
        if (target.pathname === "/x/web-interface/view") {
          const bvid = target.searchParams.get("bvid");
          if (bvid !== VIEW.bvid) return { data: { code: -404, message: "啥都木有" } };
          return ok(VIEW);
        }
        if (target.pathname === "/x/space/wbi/arc/search") {
          if (!target.searchParams.get("w_rid")) return { data: { code: -352, message: "风控校验失败" } };
          return ok({ list: { vlist: [{ bvid: VIEW.bvid, title: "登录投稿", pic: "//x.jpg", author: "UP", play: 1, video_review: 1, length: "01:00", created: 1793443764, description: "" }] } });
        }
        if (target.pathname === "/x/web-interface/nav") return ok(VIEW_NAV);
        if (target.pathname === "/x/player/playurl") {
          if (String(target.searchParams.get("fnval")) === "1") {
            return ok({ quality: 64, format: "mp4720", durl: [{ url: "https://upos.example/merged.mp4" }] });
          }
          return ok(PLAYURL);
        }
        if (target.pathname === "/x/web-interface/popular") return ok({ list: [VIEW] });
        return { data: { code: 0, data: {} } };
      }
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
        const fnval = String(options.params && options.params.fnval || "");
        if (fnval === "1") {
          return ok({
            quality: 64,
            format: "mp4720",
            durl: [{ url: "https://upos.example/merged.mp4", size: 1000 }]
          });
        }
        return ok(PLAYURL);
      }
      throw new Error("unmocked url " + url);
    }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  const crypto = require("crypto");
  for (const sample of ["abc", "", "hello world", "中文测试", "a=1&b=2"]) {
    assert.equal(md5(sample), crypto.createHash("md5").update(sample).digest("hex"), `MD5 错误: ${sample}`);
  }

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
  assert.equal(resources.length, 1, "优先使用单文件 MP4（音视频合并）");
  assert.equal(resources[0].name, "720P");
  assert.ok(resources[0].url.includes("merged.mp4"));
  assert.ok(resources[0].description.includes("音视频已合并"));
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

  const loginParams = { loginServer: "https://bili-login.example/", loginKey: "bk_" + "a".repeat(32) };
  const loginPopular = await loadPopular({ ...loginParams, count: "5" });
  assert.equal(loginPopular.length, 1, "登录服务模式下应能取到列表");
  assert.ok(proxyCalls.some((u) => u.includes("/x/web-interface/popular")), "必须走登录服务代理");
  assert.ok(!calls.some((c) => c.url.endsWith("/x/frontend/finger/spi") && c.after === "login"), "登录模式不应再取 buvid");

  const loginDetail = await loadDetail("bili:bvid:BV1Nax16uEHm");
  assert.ok(loginDetail, "详情应可解析");

  const loginRes = await loadResource({ ...loginParams, link: "bili:bvid:BV1Nax16uEHm" });
  assert.ok(loginRes.length >= 1, "登录模式应取到播放线路");
  assert.ok(proxyCalls.some((u) => u.includes("/x/player/playurl")), "播放地址需走代理");

  const loginUploader = await loadUploader({ ...loginParams, mid: "946974", count: "5" });
  assert.equal(loginUploader.length, 1, "登录服务下 UP 主投稿应可取到");
  const arcProxy = calls.filter((c) => c.url.includes("/api/proxy") && c.options.params.url.includes("arc/search"));
  assert.ok(arcProxy.length > 0, "UP 主请求需走登录服务");
  assert.ok(arcProxy[0].options.params.url.includes("w_rid="), "必须带 WBI 签名");

  // 画质模式
  const mergedMode = await loadResource({ ...loginParams, link: "bili:bvid:BV1Nax16uEHm", qualityMode: "merged" });
  assert.equal(mergedMode.length, 1, "merged 模式只返回单文件");
  assert.ok(mergedMode[0].description.includes("音视频已合并"));

  const dashMode = await loadResource({ ...loginParams, link: "bili:bvid:BV1Nax16uEHm", qualityMode: "dash" });
  assert.ok(dashMode.some((r) => r.name === "1080P"), "dash 模式应含 1080P");
  assert.ok(dashMode.some((r) => r.name === "音轨"), "dash 模式应含独立音轨");

  const bothMode = await loadResource({ ...loginParams, link: "bili:bvid:BV1Nax16uEHm", qualityMode: "both" });
  assert.ok(bothMode.length > dashMode.length, "both 模式应同时包含两种");

  const beforeInsecure = proxyCalls.length;
  await loadResource({ loginServer: "http://insecure.example", loginKey: loginParams.loginKey, link: "bili:bvid:BV1Nax16uEHm" });
  assert.equal(proxyCalls.length, beforeInsecure, "非 HTTPS 地址不得走登录服务");
  const beforeBadKey = proxyCalls.length;
  await loadResource({ loginServer: loginParams.loginServer, loginKey: "bad-key", link: "bili:bvid:BV1Nax16uEHm" });
  assert.equal(proxyCalls.length, beforeBadKey, "非法 key 不得走登录服务");

  console.log("Bilibili widget tests passed", { target, calls: calls.length, proxy: proxyCalls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
