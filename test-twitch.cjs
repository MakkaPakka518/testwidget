const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/twitch.js";

const calls = [];

function streamNode(login = "squeezie", title = "Test Stream") {
  return {
    id: "318204974307",
    title,
    viewersCount: 110695,
    previewImageURL: "https://static-cdn.jtvnw.net/previews-ttv/live_user_squeezie-640x360.jpg",
    broadcaster: {
      login,
      displayName: login.toUpperCase(),
      profileImageURL: "https://static-cdn.jtvnw.net/avatar-70x70.png"
    },
    game: { name: "VALORANT", displayName: "VALORANT" }
  };
}

const MASTER = [
  "#EXTM3U",
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="1080p60",NAME="1080p60"',
  '#EXT-X-STREAM-INF:BANDWIDTH=8042999,RESOLUTION=1920x1080,VIDEO="1080p60"',
  "https://use21.playlist.ttvnw.net/v1/playlist/aaa.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=627900,RESOLUTION=640x360,VIDEO="360p30"',
  "https://use21.playlist.ttvnw.net/v1/playlist/bbb.m3u8"
].join("\n");

global.Widget = {
  http: {
    post: async (url, body, options = {}) => {
      calls.push({ url, body, options });
      assert.equal(url, "https://gql.twitch.tv/gql");
      const query = String(body.query || "");
      if (query.includes("streamPlaybackAccessToken")) {
        return { data: { data: { streamPlaybackAccessToken: { value: "{\"channel\":\"squeezie\"}", signature: "sig-live" } } } };
      }
      if (query.includes("videoPlaybackAccessToken")) {
        return { data: { data: { videoPlaybackAccessToken: { value: "{\"vod_id\":2915087502}", signature: "sig-vod" } } } };
      }
      if (query.includes("user(login")) {
        return { data: { data: { user: { stream: streamNode("squeezie") } } } };
      }
      if (query.includes("game(name")) {
        return { data: { data: { game: { id: "516575", displayName: "VALORANT", streams: { edges: [{ node: streamNode("squeezie") }, { node: { id: null, broadcaster: null } }] } } } } };
      }
      if (query.includes("video(id")) {
        return { data: { data: { video: { id: "2915087502", title: "VOD Title", lengthSeconds: 11265, previewThumbnailURL: "https://thumb.jpg", owner: { login: "twitch", displayName: "Twitch", profileImageURL: "https://a.png" }, game: { name: "Art", displayName: "Art" } } } } };
      }
      if (query.includes("games(first")) {
        return { data: { data: { games: { edges: [{ node: { id: "509658", name: "Just Chatting", displayName: "Just Chatting", viewersCount: 429060, boxArtURL: "https://box.jpg" } }] } } } };
      }
      if (query.includes("streams(first")) {
        return { data: { data: { streams: { edges: [{ node: streamNode("squeezie") }] } } } };
      }
      throw new Error("unmocked gql query: " + query);
    },
    get: async (url, options = {}) => {
      calls.push({ url, options });
      assert.ok(url.startsWith("https://usher.ttvnw.net/"), "unexpected GET " + url);
      assert.equal(options.params.sig, url.includes("/vod/") ? "sig-vod" : "sig-live");
      return { data: MASTER };
    }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(target, "utf8"));

(async () => {
  const top = await loadTopStreams({ count: "20" });
  assert.equal(top.length, 1);
  assert.equal(top[0].type, "url");
  assert.equal(top[0].id, "https://www.twitch.tv/squeezie");
  assert.equal(top[0].link, "twitch:live:squeezie");
  assert.equal(top[0].videoUrl, undefined, "列表不应缓存播放地址");
  assert.equal(top[0].peoples[0].id, "squeezie");

  const byGame = await loadTopStreams({ game: "VALORANT", count: "10" });
  assert.equal(byGame.length, 1, "空节点必须被过滤");

  const games = await loadGames({ count: "5" });
  assert.equal(games.length, 1);
  assert.equal(games[0].title, "Just Chatting");

  const channel = await loadChannel({ channel: "squeezie" });
  assert.equal(channel.length, 1);

  const detail = await loadDetail("twitch:live:squeezie");
  assert.equal(detail.link, "twitch:live:squeezie");

  const resource = await loadResource({ link: "twitch:live:squeezie" });
  assert.equal(resource.length, 2);
  assert.equal(resource[0].name, "1080p60");
  assert.equal(resource[1].name, "360p30");
  assert.equal(resource[0].playerType, "app");
  assert.equal(resource[0].customHeaders["X-Forward-Skip-Redirect-Probe"], "1");
  assert.ok(resource[0].url.startsWith("https://use21.playlist.ttvnw.net/"));

  const vodDetail = await loadDetail("https://www.twitch.tv/videos/2915087502");
  assert.equal(vodDetail.link, "twitch:vod:2915087502");
  assert.equal(vodDetail.durationText, "03:07:45");

  const vodResources = await loadResource({ link: "twitch:vod:2915087502" });
  assert.equal(vodResources.length, 2);
  assert.ok(calls.some((call) => call.url.startsWith("https://usher.ttvnw.net/vod/2915087502.m3u8")));

  const searched = await search({ keyword: "VALORANT", mode: "category" });
  assert.equal(searched.length, 1);
  assert.equal(await loadDetail("bad-link"), null);
  assert.deepEqual(await loadResource({ link: "https://evil.test/squeezie", id: "twitch:live:squeezie" }), []);

  console.log("Twitch widget tests passed", { target, calls: calls.length });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
