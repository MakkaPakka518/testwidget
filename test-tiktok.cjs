const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/tiktok.js";

const calls = [];

function tikwmVideo(id = "6718335390845095173", username = "scout2015") {
  return {
    id,
    title: "Scramble up ur name",
    cover: "https://cdn.example/cover.jpg",
    duration: 10,
    play: `https://cdn.example/${id}.mp4`,
    hdplay: `https://cdn.example/${id}-hd.mp4`,
    wmplay: `https://cdn.example/${id}-wm.mp4`,
    size: 2000000,
    hd_size: 3000000,
    play_count: 12000,
    digg_count: 3400,
    comment_count: 56,
    share_count: 78,
    create_time: 1564234358,
    author: {
      unique_id: username,
      nickname: "Scout",
      avatar: "https://cdn.example/avatar.jpg"
    }
  };
}

function photoPost() {
  return {
    video_id: "7689674036749651208",
    title: "photo mode",
    cover: "https://cdn.example/photo.jpg",
    duration: 0,
    play: "https://cdn.example/audio.mp3",
    images: ["https://cdn.example/photo-1.jpg"],
    author: { unique_id: "photo.user", nickname: "Photo", avatar: "" }
  };
}

function officialHtml(id, username) {
  const hydration = {
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": {
        statusCode: 0,
        itemInfo: {
          itemStruct: {
            id,
            desc: "Official fallback",
            createTime: "1564234358",
            author: {
              uniqueId: username,
              nickname: "Official",
              avatarMedium: "https://cdn.example/official-avatar.jpg"
            },
            stats: { playCount: 1, diggCount: 2, commentCount: 3, shareCount: 4 },
            video: {
              duration: 12,
              cover: "https://cdn.example/official-cover.jpg",
              playAddr: `https://cdn.example/${id}-official.mp4`,
              bitrateInfo: [
                {
                  GearName: "normal_720",
                  PlayAddr: {
                    Height: 720,
                    DataSize: 4000000,
                    UrlList: [`https://cdn.example/${id}-720.mp4`]
                  }
                }
              ]
            }
          }
        }
      }
    }
  };
  return `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(hydration)}</script></html>`;
}

global.Widget = {
  http: {
    get: async (url, options = {}) => {
      calls.push({ url, options });

      if (url.endsWith("/api/feed/list")) {
        return { data: { code: 0, msg: "success", data: [tikwmVideo(), photoPost()] } };
      }

      if (url.endsWith("/api/")) {
        const input = String(options.params && options.params.url || "");
        if (input.includes("9999999999999999999")) {
          return { data: { code: 0, data: tikwmVideo("1111111111111111111", "wrong.user") } };
        }
        if (input.includes("8888888888888888888")) {
          return { data: { code: -1, msg: "not found", data: null } };
        }
        return { data: { code: 0, msg: "success", data: tikwmVideo() } };
      }

      if (url === "https://www.tiktok.com/@fallback.user/video/8888888888888888888") {
        return { data: officialHtml("8888888888888888888", "fallback.user") };
      }

      throw new Error(`unmocked url: ${url}`);
    }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  const list = await loadPopular({ count: "20" });
  assert.equal(list.length, 1, "图集音频不能作为视频返回");
  assert.equal(list[0].type, "url");
  assert.equal(list[0].id, "https://www.tiktok.com/@scout2015/video/6718335390845095173");
  assert.equal(list[0].link, "tiktok:6718335390845095173:scout2015");
  assert.equal(list[0].videoUrl, undefined, "列表不应缓存临时播放地址");
  assert.equal(list[0].headers, undefined, "VideoItem 不支持 headers 字段");
  assert.equal(list[0].poster_path, undefined, "原始 API 字段不能泄漏");
  assert.equal(calls[0].options.params.region, "TW");
  assert.equal(calls[0].options.params.count, "20");
  const regionParam = WidgetMetadata.modules[0].params.find((item) => item.name === "region");
  assert.equal(regionParam.value, "TW");
  assert.ok(regionParam.enumOptions.some((item) => item.value === "HK"));
  assert.ok(regionParam.enumOptions.some((item) => item.value === "SG"));
  assert.ok(regionParam.enumOptions.some((item) => item.value === "MY"));

  const callsAfterList = calls.length;
  const detail = await loadDetail(list[0].link);
  assert.equal(detail.id, list[0].id);
  assert.equal(detail.type, "url");
  assert.equal(detail.videoUrl, undefined, "详情不应缓存临时播放地址");

  const resources = await loadResource({ link: list[0].link, id: "unrelated" });
  assert.equal(resources.length, 3);
  assert.equal(resources[0].name, "高清");
  assert.equal(resources[0].playerType, "app");
  assert.equal(resources[0].customHeaders["X-Forward-Skip-Redirect-Probe"], "1");
  assert.equal(calls.length, callsAfterList, "列表、详情和起播应复用短期缓存，避免连续请求上游");

  const callsBeforeInvalid = calls.length;
  assert.deepEqual(await loadResource({ link: "https://evil.test/video/6718335390845095173", id: list[0].id }), []);
  assert.equal(calls.length, callsBeforeInvalid, "非法高优先级 link 不能回退到 id 发请求");
  assert.deepEqual(await loadResource({ id: "550" }), []);
  assert.equal(calls.length, callsBeforeInvalid, "无关 id 不应发请求");

  const direct = await loadByUrl({ url: "https://www.tiktok.com/@scout2015/video/6718335390845095173" });
  assert.equal(direct.length, 1);
  assert.equal(direct[0].id, list[0].id);

  const beforeEvil = calls.length;
  assert.deepEqual(await loadByUrl({ url: "https://www.tiktok.com.evil.test/@scout2015/video/6718335390845095173" }), []);
  assert.deepEqual(await search({ keyword: "cat videos" }), []);
  assert.equal(calls.length, beforeEvil, "外站链接和普通关键词不应调用解析服务");

  const mismatch = await loadByUrl({ url: "https://www.tiktok.com/@wrong.user/video/9999999999999999999" });
  assert.deepEqual(mismatch, [], "解析服务返回不同视频 ID 时必须拒绝");

  const fallbackLink = "tiktok:8888888888888888888:fallback.user";
  const fallbackDetail = await loadDetail(fallbackLink);
  assert.equal(fallbackDetail.id, "https://www.tiktok.com/@fallback.user/video/8888888888888888888");
  assert.equal(fallbackDetail.title, "Official fallback");
  const fallbackResources = await loadResource({ link: fallbackLink });
  assert.ok(fallbackResources.some((item) => item.url.includes("8888888888888888888-720.mp4")));

  const apiCalls = calls.filter((call) => call.url.endsWith("/api/"));
  assert.ok(apiCalls.every((call) => call.options.params && call.options.params.hd === "1"));
  console.log("TikTok widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
