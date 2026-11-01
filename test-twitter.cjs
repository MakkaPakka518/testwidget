const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/twitter.js";

const calls = [];

function videoStatus(id = "2102147636702634195", handle = "X") {
  return {
    type: "status",
    id,
    url: `https://x.com/${handle}/status/${id}`,
    text: "timeline. ticker. trade.",
    translation: { text: "时间线。股票行情。交易。" },
    created_timestamp: 1790026027,
    views: 6043597,
    likes: 14746,
    reposts: 2180,
    replies: 1794,
    author: {
      screen_name: handle,
      name: handle,
      avatar_url: "https://pbs.twimg.com/profile.jpg"
    },
    media: {
      videos: [
        {
          id: "media-1",
          type: "video",
          url: `https://video.twimg.com/${id}/1080.mp4`,
          thumbnail_url: "https://pbs.twimg.com/video-thumb.jpg",
          duration: 40.2,
          width: 1920,
          height: 1080,
          formats: [
            { url: `https://video.twimg.com/${id}/master.m3u8`, container: "m3u8" },
            { url: `https://video.twimg.com/${id}/720.mp4`, container: "mp4", codec: "h264", bitrate: 2176000, height: 720 },
            { url: `https://video.twimg.com/${id}/1080.mp4`, container: "mp4", codec: "h264", bitrate: 10368000, height: 1080 }
          ]
        }
      ]
    }
  };
}

function photoStatus() {
  return {
    type: "status",
    id: "2116401549828391177",
    text: "photo only",
    author: { screen_name: "SpaceX", name: "SpaceX", avatar_url: "" },
    media: { photos: [{ type: "photo", url: "https://pbs.twimg.com/photo.jpg" }] }
  };
}

global.Widget = {
  http: {
    get: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/2/profile/") && url.endsWith("/media")) {
        const handle = url.split("/2/profile/")[1].split("/")[0];
        return { data: { code: 200, results: [videoStatus("2102147636702634195", handle), photoStatus()] } };
      }
      if (url.endsWith("/2/search")) {
        return { data: { code: 200, results: [videoStatus("2102147636702634196", "SearchUser"), photoStatus()] } };
      }
      const detailMatch = url.match(/\/2\/status\/(\d+)$/);
      if (detailMatch) {
        if (detailMatch[1] === "9999999999999999999") {
          return { data: { code: 200, status: videoStatus("1111111111111111111", "Wrong") } };
        }
        return { data: { code: 200, status: videoStatus(detailMatch[1], "DirectUser") } };
      }
      throw new Error(`unmocked url: ${url}`);
    }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  const list = await loadUserVideos({ username: "SpaceX", count: "20", language: "zh-cn" });
  assert.equal(list.length, 1, "纯图片推文必须被过滤");
  assert.equal(list[0].type, "url");
  assert.equal(list[0].title, "时间线。股票行情。交易。");
  assert.equal(list[0].id, "https://x.com/SpaceX/status/2102147636702634195");
  assert.equal(list[0].link, "xstatus:2102147636702634195");
  assert.equal(list[0].videoUrl, undefined);
  assert.equal(calls[0].options.params.count, "20");
  assert.equal(calls[0].options.params.lang, "zh-cn");

  const callsAfterList = calls.length;
  const detail = await loadDetail(list[0].link);
  assert.equal(detail.id, list[0].id);
  const resources = await loadResource({ link: list[0].link });
  assert.equal(resources.length, 3);
  assert.equal(resources[0].name, "1080P");
  assert.equal(resources[1].name, "720P");
  assert.equal(resources[2].name, "HLS AUTO");
  assert.equal(resources[0].playerType, "app");
  assert.equal(calls.length, callsAfterList, "详情和起播应复用列表缓存");

  const direct = await loadByUrl({
    url: "https://twitter.com/DirectUser/status/2102147636702634197/video/1",
    language: "zh-cn"
  });
  assert.equal(direct.length, 1);
  assert.equal(direct[0].id, "https://x.com/DirectUser/status/2102147636702634197");

  const byUser = await search({ keyword: "@SpaceX", count: "5", language: "zh-cn" });
  assert.equal(byUser.length, 1);
  const searched = await search({ keyword: "rocket", feed: "media", count: "10", language: "zh-cn" });
  assert.equal(searched.length, 1);
  const searchCall = calls.find((call) => call.url.endsWith("/2/search"));
  assert.deepEqual(searchCall.options.params, { q: "rocket", feed: "media", count: "10", lang: "zh-cn" });

  const callsBeforeInvalid = calls.length;
  assert.deepEqual(await loadByUrl({ url: "https://x.com.evil.test/X/status/2102147636702634195" }), []);
  assert.deepEqual(await loadResource({ link: "https://evil.test/X/status/2102147636702634195", id: list[0].id }), []);
  assert.equal(calls.length, callsBeforeInvalid, "非法来源不得发请求");

  const mismatch = await loadByUrl({ url: "https://x.com/Wrong/status/9999999999999999999" });
  assert.deepEqual(mismatch, [], "API 返回不同推文 ID 时必须拒绝");
  assert.equal(await loadDetail("bad-link"), null);
  console.log("Twitter widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
