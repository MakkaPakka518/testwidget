import { defineConfig } from "@rslib/core";
import { pluginRexWidget } from "@rexnow/rslib-plugin";

export default defineConfig({
  source: {
    entry: {
      tiktok: "./widgets/tiktok.js",
      twitter: "./widgets/twitter.js",
      twitch: "./widgets/twitch.js",
      flixpatrol: "./widgets/flixpatrol.js",
      anigamer: "./widgets/anigamer.js",
      "anigamer-site": "./widgets/anigamer-site.js",
      linetv: "./widgets/linetv.js",
      bilibili: "./widgets/bilibili.js",
      douyin: "./widgets/douyin.js"
    }
  },
  lib: [
    {
      format: "esm",
      syntax: "es6"
    }
  ],
  output: {
    target: "web",
    autoExternal: false
  },
  plugins: [
    pluginRexWidget({
      typesFilePath: "rex-widget-env.d.ts",
      encrypt: false
    })
  ]
});
