import assert from "node:assert/strict";
import { extractGraphqlVideoStatuses } from "./x-parser.mjs";

function tweetResult(id, type = "video") {
  const media = type === "video" ? [{
    id_str: `media-${id}`,
    type: "video",
    media_url_https: "https://pbs.twimg.com/thumb.jpg",
    original_info: { width: 1920, height: 1080 },
    video_info: {
      duration_millis: 12000,
      variants: [
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/master.m3u8" },
        { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/720.mp4" }
      ]
    }
  }] : [{ id_str: `media-${id}`, type: "photo", media_url_https: "https://pbs.twimg.com/photo.jpg" }];
  return {
    rest_id: id,
    views: { count: "1234" },
    core: {
      user_results: {
        result: {
          legacy: {
            screen_name: "VideoUser",
            name: "Video User",
            profile_image_url_https: "https://pbs.twimg.com/avatar_normal.jpg"
          }
        }
      }
    },
    legacy: {
      full_text: "List video",
      created_at: "Mon Sep 21 21:27:07 +0000 2026",
      favorite_count: 10,
      retweet_count: 2,
      reply_count: 1,
      extended_entities: { media }
    }
  };
}

const payload = {
  data: {
    list: {
      tweets_timeline: {
        timeline: {
          instructions: [{
            entries: [
              { content: { itemContent: { tweet_results: { result: tweetResult("2102147636702634195") } } } },
              { content: { itemContent: { tweet_results: { result: tweetResult("2116401549828391177", "photo") } } } }
            ]
          }]
        }
      }
    }
  }
};

const statuses = extractGraphqlVideoStatuses(payload, 20);
assert.equal(statuses.length, 1);
assert.equal(statuses[0].id, "2102147636702634195");
assert.equal(statuses[0].author.screen_name, "VideoUser");
assert.equal(statuses[0].media.videos[0].formats.length, 2);
assert.equal(statuses[0].media.videos[0].url, "https://video.twimg.com/720.mp4");
console.log("X GraphQL parser tests passed");
