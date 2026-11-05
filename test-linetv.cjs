const fs = require("fs");
const assert = require("assert/strict");
const target = process.argv[2] || "./widgets/linetv.js";

const catalog = { dramaId: 23570, name: "小豆與小麥", year: 2026, totalEps: 12, currentEps: 5, posterUrl: "https://img/backdrop.jpg", verticalPosterUrl: "https://img/poster.jpg", labels: [{ title: "獨家" }] };
const detail = {
  drama_id: "23570", drama_name: "小豆與小麥", year: 2026, total_eps: 12,
  horizontal_poster_url: "https://img/backdrop.jpg", vertical_poster_url: "https://img/poster.jpg",
  introduction: "剧情", actors: [{ name: "齋藤飛鳥", photoUrl: "https://img/actor.jpg" }], genres: [{ key: "戲劇" }],
  eps_info: [{ number: 1, title: "第1集", durationInMs: 1800000, svod: false }, { number: 2, title: "第2集", durationInMs: 1800000, svod: true }]
};
const calls = [];
const storage = {};
let playbackMode = "hls";

global.Widget = {
  http: {
    get: async (url, options) => {
      calls.push({ method: "GET", url, options });
      if (url.includes("/api/dramaInfo/23570")) return { data: detail };
      if (url.includes("related-dramas")) return { data: { datas: [catalog] } };
      if (url.includes("/api/part/v2/")) {
        if (playbackMode === "drm") return { data: { sourceInfo: { decryptionType: "DRM", dash: { url: "https://cdn/video.mpd" }, license: { widevine: "https://license/widevine", licenseHeaders: [{ for: ["widevine"], key: "Authorization", value: "token" }] } } } };
        return { data: { sourceInfo: { decryptionType: "ClearKey", hls: { url: "https://cdn/jurassicPark/master.m3u8", keyId: "key", keyType: "type" } } } };
      }
      if (url.includes("/jurassicPark/master.m3u8")) return { data: "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"AAC\",DEFAULT=YES,AUTOSELECT=YES,URI=\"audio/index.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO=\"audio\"\n1080/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,AUDIO=\"audio\"\n720/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=150000,RESOLUTION=426x239,AUDIO=\"audio\"\n239/index.m3u8\n" };
      if (url.includes("/jurassicPark/1080/index.m3u8") || url.includes("/jurassicPark/720/index.m3u8")) return { data: "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"../keys/key.bin\"\n#EXTINF:6,\nsegment-1.ts\n" };
      if (url.includes("/jurassicPark/audio/index.m3u8")) return { data: "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"../keys/audio-key.bin\"\n#EXTINF:6,\naudio-1.ts\n" };
      if (url.includes("/jurassicPark/keys/")) return { data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) };
      if (url.includes("/api/drama?")) return { data: { summary: JSON.stringify([{ drama_id: 23570, name: "小豆與小麥", actors: [{ name: "齋藤飛鳥" }], total_eps: 12, current_eps: 5 }]) } };
      if (url.includes("release-schedule")) return { data: { datas: [catalog] } };
      if (url.includes("channels/")) return { data: [{ type: "album", datas: [catalog] }] };
      return { data: [{ type: "top10", datas: [catalog] }] };
    },
    post: async (url, body, options) => {
      calls.push({ method: "POST", url, body, options });
      return { data: { token: "jp-token" } };
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
  assert.equal(WidgetMetadata.version, "2.0.3");
  assert.ok(WidgetMetadata.modules.some(module => module.id === "loadResource" && module.type === "stream"));

  const list = await loadLineTv({ source: "top10", page: 1 });
  assert.equal(list[0].type, "url");
  assert.equal(list[0].id, "linetv:drama:23570");
  assert.equal(list[0].posterPath, "https://img/poster.jpg");
  assert.equal(list[0].tmdbId, undefined);

  const found = await searchLineTv({ keyword: "齋藤", page: 1 });
  assert.equal(found[0].id, "linetv:drama:23570");

  const item = await loadDetail("linetv:drama:23570");
  assert.equal(item.title, "小豆與小麥");
  assert.equal(item.episodeItems.length, 2);
  assert.equal(item.episodeItems[0].link, "linetv:episode:23570:1");
  assert.equal(await loadDetail("https://evil.example/drama/23570"), null);

  const beforeInvalid = calls.length;
  assert.deepEqual(await loadResource({ link: "https://evil.example/drama/23570", episode: 1 }), []);
  assert.equal(calls.length, beforeInvalid);

  const hls = await loadResource({ link: "linetv:episode:23570:1" });
  assert.deepEqual(hls.map(resource => resource.name), ["LINE TV 1080P", "LINE TV 720P"]);
  assert.ok(hls.every(resource => resource.customHeaders.authentication === "jp-token"));
  assert.ok(hls.every(resource => resource.url.startsWith("data:application/vnd.apple.mpegurl")));
  const rewritten = decodeURIComponent(hls[0].url.split(",")[1]);
  assert.match(rewritten, /#EXT-X-MEDIA:TYPE=AUDIO/);
  assert.match(rewritten, /AUDIO="audio"/);
  assert.match(rewritten, /URI="data:application\/vnd\.apple\.mpegurl/);
  assert.match(rewritten, /data:application\/vnd\.apple\.mpegurl[^\n]+/);
  assert.ok(!hls.some(resource => resource.name.includes("239P")));
  const keyCalls = calls.filter(call => call.url.includes("/jurassicPark/keys/"));
  assert.ok(keyCalls.length >= 2);
  assert.ok(keyCalls.every(call => call.options.responseType === "arraybuffer" && call.options.headers.authentication === "jp-token"));
  assert.ok(calls.some(call => call.method === "POST" && call.url.includes("/api/part/dinosaurKeeper?")));

  playbackMode = "drm";
  const drm = await loadResource({ link: "linetv:episode:23570:1" });
  assert.equal(drm[0].url, "https://cdn/video.mpd");
  assert.deepEqual(drm[0].drm, { scheme: "widevine", licenseUrl: "https://license/widevine", headers: { Authorization: "token" } });
  assert.ok(calls.filter(call => call.url.includes("/api/part/v2/")).every(call => call.url.includes("device=desktop_web") && call.url.includes("productType=VOD")));

  console.log("LINE TV playback widget tests passed", { calls: calls.length });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
