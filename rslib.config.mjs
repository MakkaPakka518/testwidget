import { defineConfig } from "@rslib/core";
import { pluginRexWidget } from "@rexnow/rslib-plugin";

export default defineConfig({
  source: {
    entry: {
      tiktok: "./widgets/tiktok.js",
      twitter: "./widgets/twitter.js",
      twitch: "./widgets/twitch.js",
      bilibili: "./widgets/bilibili.js"
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
