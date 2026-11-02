const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/douyin.js";

const calls = [];
const storage = new Map();

function video(id = "7677873898611989236") {
  return {
    aweme_id: id,
    desc: "抖音测试视频",
    create_time: 1793500000,
    author: {
      nickname: "玛卡巴卡",
      unique_id: "makka",
      avatar_thumb: { url_list: ["https://cdn.example/avatar.jpg"] }
    },
    statistics: {
      play_count: 12345,
      digg_count: 2345,
      comment_count: 123,
      share_count: 45
    },
    video: {
      duration: 15000,
      cover: { url_list: ["https://cdn.example/cover.jpg"] },
      play_addr_h264: {
        uri: `v0200fg10000${id}`,
        url_list: [`https://cdn.example/${id}-h264.mp4`]
      },
      play_addr: {
        uri: `v0300fg10000${id}`,
        url_list: [`https://cdn.example/${id}.mp4`]
      },
      bit_rate: [
        {
          gear_name: "normal_1080",
          bit_rate: 2500000,
          is_h265: 0,
          play_addr: { url_list: [`https://cdn.example/${id}-1080.mp4`] }
        },
        {
          gear_name: "h265_4k",
          bit_rate: 5000000,
          is_h265: 1,
          play_addr: { url_list: [`https://cdn.example/${id}-h265.mp4`] }
        }
      ]
    }
  };
}

function imagePost() {
  return {
    aweme_id: "7666666666666666666",
    desc: "图文",
    images: [{ url_list: ["https://cdn.example/image.jpg"] }],
    video: { duration: 0, play_addr: {} },
    author: { nickname: "Photo" }
  };
}

global.Widget = {
  http: {
    get: async (url, options = {}) => {
      calls.push({ method: "GET", url, options });
      if (url.endsWith("/janus/douyin/creator/pc/work_list")) {
        if (String(options.headers.Cookie || "").includes("expired")) {
          return { data: { status_code: 8, status_msg: "用户未登录" } };
        }
        const cursor = String(options.params.max_cursor || "0");
        return {
          data: {
            status_code: 0,
            aweme_list: cursor === "next-1" ? [video("7688888888888888888")] : [video(), imagePost()],
            max_cursor: cursor === "next-1" ? "next-2" : "next-1",
            has_more: 1
          }
        };
      }
      throw new Error(`unmocked url: ${url}`);
    }
  },
  storage: {
    async get(key) { return storage.get(key); },
    async set(key, value) { storage.set(key, value); },
    async remove(key) { storage.delete(key); }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  assert.equal(WidgetMetadata.id, "com.douyin.creator");
  const cookieParam = WidgetMetadata.globalParams.find((item) => item.name === "cookie");
  assert.ok(cookieParam);
  assert.equal(cookieParam.type, "input");

  const beforeEmpty = calls.length;
  assert.deepEqual(await loadMyWorks({ cookie: "" }), []);
  assert.deepEqual(await loadMyWorks({ cookie: "sessionid=test\ninjected" }), []);
  assert.equal(calls.length, beforeEmpty, "无效 Cookie 不应发请求");

  const cookie = "sessionid=test-session; sid_tt=test-sid";
  const list = await loadMyWorks({ cookie, page: "1", count: "18" });
  assert.equal(list.length, 1, "图文作品不能作为视频返回");
  assert.equal(list[0].type, "url");
  assert.equal(list[0].link, "douyin:7677873898611989236");
  assert.equal(list[0].videoUrl, undefined, "列表不应写入临时播放地址");
  assert.equal(list[0].poster_path, undefined, "不能泄漏原始 API 字段");

  const creatorCall = calls.find((call) => call.url.includes("creator/pc/work_list"));
  assert.equal(creatorCall.options.headers.Cookie, cookie);
  assert.equal(creatorCall.options.params.max_cursor, "0");
  assert.ok(creatorCall.options.headers.Referer.startsWith("https://creator.douyin.com/"));

  const secondPage = await loadMyWorks({ cookie, page: "2", count: "18" });
  assert.equal(secondPage.length, 1);
  const creatorCalls = calls.filter((call) => call.url.includes("creator/pc/work_list"));
  assert.equal(creatorCalls[1].options.params.max_cursor, "next-1");

  const callCountAfterList = calls.length;
  const detail = await loadDetail(list[0].link);
  assert.equal(detail.id, "https://www.douyin.com/video/7677873898611989236");
  const resources = await loadResource({ link: list[0].link });
  assert.ok(resources.length >= 3);
  assert.equal(resources[0].name, "官方 H.264");
  assert.ok(resources[0].url.includes("/aweme/v1/play/?video_id="));
  assert.equal(resources[0].customHeaders.Cookie, undefined, "Cookie 不得发送给视频 CDN");
  assert.ok(!resources.some((item) => item.url.includes("h265")), "默认过滤 H.265 线路");
  assert.equal(calls.length, callCountAfterList, "详情和播放应复用缓存");

  const beforeInvalid = calls.length;
  assert.equal(await loadDetail("https://evil.example/video/7677873898611989236"), null);
  assert.deepEqual(await loadResource({ link: "https://evil.example/video/7677873898611989236", id: list[0].link }), []);
  assert.deepEqual(await loadResource({ id: "550" }), []);
  assert.equal(calls.length, beforeInvalid, "无关链接不得发请求");

  await assert.rejects(
    () => loadMyWorks({ cookie: "sessionid=expired", page: "1" }),
    /Cookie 已失效/
  );

  console.log("Douyin widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
