const fs = require("fs");
const assert = require("assert/strict");

const BASE = "https://api.gamer.com.tw";

global.Widget = {
  http: {
    get: async (url) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (ForwardWidget AniGamer live test)" }
      });
      const text = await response.text();
      let data = text;
      try { data = JSON.parse(text); } catch (error) {}
      return { data, statusCode: response.status, headers: {} };
    }
  },
  html: { load: (html) => require("/opt/project1/node_modules/cheerio").load(html) },
  storage: {
    _m: new Map(),
    get: async (key) => this._m.get(key) || null,
    set: async (key, value) => { this._m.set(key, value); },
    remove: async (key) => { this._m.delete(key); }
  }
};
global.WidgetMetadata = {};

eval(fs.readFileSync(process.argv[2] || "./widgets/anigamer-site.js", "utf8"));

(async () => {
  const recent = await loadRecent({ page: 1 });
  assert.ok(recent.length > 0, "loadRecent must return items");
  assert.ok(recent.every(item => /^anigamer:anime:\d+$/.test(item.id)), "list ids must be namespaced");
  assert.ok(recent.every(item => item.type === "url"));
  assert.ok(recent.every(item => item.title && !/\[[^\]]*\]$/.test(item.title)), "bracket suffix stripped");
  assert.ok(recent.every(item => Object.keys(item).every(key => [
    "id", "type", "title", "posterPath", "backdropPath", "description",
    "releaseDate", "rating", "mediaType", "genreTitle", "link"
  ].includes(key))), "no non-standard fields on list items");

  const hot = await loadHot({ page: 1 });
  assert.ok(hot.length > 0);

  const themes = await loadThemes({ page: 1 });
  assert.ok(themes.length > 0);

  const search = await searchAnime({ keyword: "孤獨", page: 1 });
  assert.ok(search.length > 0);
  assert.ok(search.some(item => item.title.includes("孤獨")));

  const first = recent[0];
  const detail = await loadDetail(first.id);
  assert.equal(detail.id, first.id);
  assert.ok(detail.title);
  assert.ok(Array.isArray(detail.episodeItems) && detail.episodeItems.length > 0, "detail must expose episodes");
  assert.ok(detail.episodeItems.every(e => /^anigamer:episode:\d+:\d+$/.test(e.id)));
  assert.ok(detail.episodeItems.every(e => e.type === "url"));

  const firstEpisode = detail.episodeItems[0];
  const info = await fetch(`${BASE}/anime/v1/video.php?videoSn=${firstEpisode.id.split(":").pop()}`);
  const body = await info.json();
  assert.ok(body.data && body.data.anime, "episode videoSn resolves on the real API");
  assert.equal(body.data.anime.animeSn, Number(first.id.split(":").pop()));

  assert.equal(await loadDetail("https://ani.gamer.com.tw.evil.com/animeVideo.php?sn=1"), null);
  assert.equal(await loadDetail("anigamer:anime:0"), null);

  console.log("AniGamer site live API test passed", {
    recent: recent.length,
    hot: hot.length,
    themes: themes.length,
    search: search.length,
    episodes: detail.episodeItems.length
  });
})().catch(error => {
  console.error(error);
  process.exit(1);
});
