function unwrapTweetResult(value) {
  let result = value;
  for (let depth = 0; depth < 5 && result && typeof result === "object"; depth += 1) {
    if (result.tweet && typeof result.tweet === "object") {
      result = result.tweet;
      continue;
    }
    if (result.result && typeof result.result === "object" && !result.legacy) {
      result = result.result;
      continue;
    }
    break;
  }
  return result;
}

function userFromResult(result) {
  const userResult = unwrapTweetResult(result && result.core && result.core.user_results && result.core.user_results.result);
  const legacy = userResult && userResult.legacy || {};
  return {
    screen_name: String(legacy.screen_name || ""),
    name: String(legacy.name || legacy.screen_name || ""),
    avatar_url: String(legacy.profile_image_url_https || "").replace(/_normal(?=\.)/, "_200x200")
  };
}

function videoFromMedia(media) {
  if (!media || !["video", "animated_gif"].includes(media.type)) return null;
  const info = media.video_info || {};
  const formats = (Array.isArray(info.variants) ? info.variants : []).map((variant) => {
    const url = String(variant && variant.url || "");
    if (!/^https?:\/\//i.test(url)) return null;
    const contentType = String(variant.content_type || "");
    return {
      url,
      container: contentType.includes("mpegURL") ? "m3u8" : "mp4",
      codec: contentType.includes("mp4") ? "h264" : "",
      bitrate: Number(variant.bitrate || 0)
    };
  }).filter(Boolean);
  const mp4 = formats.filter((format) => format.container === "mp4").sort((a, b) => b.bitrate - a.bitrate)[0];
  const dimensions = media.original_info || {};
  return {
    id: String(media.id_str || media.media_key || ""),
    type: media.type === "animated_gif" ? "gif" : "video",
    url: String(mp4 && mp4.url || formats[0] && formats[0].url || ""),
    thumbnail_url: String(media.media_url_https || ""),
    duration: Number(info.duration_millis || 0) / 1000,
    width: Number(dimensions.width || 0),
    height: Number(dimensions.height || 0),
    formats
  };
}

export function convertGraphqlTweet(value) {
  let result = unwrapTweetResult(value);
  const retweeted = result && result.legacy && result.legacy.retweeted_status_result && result.legacy.retweeted_status_result.result;
  if (retweeted) result = unwrapTweetResult(retweeted);
  if (!result || typeof result !== "object") return null;

  const legacy = result.legacy || {};
  const id = String(result.rest_id || legacy.id_str || "");
  const author = userFromResult(result);
  if (!/^\d{2,20}$/.test(id) || !author.screen_name) return null;
  const mediaEntities = legacy.extended_entities && Array.isArray(legacy.extended_entities.media)
    ? legacy.extended_entities.media
    : [];
  const videos = mediaEntities.map(videoFromMedia).filter(Boolean);
  if (!videos.length) return null;

  const createdTimestamp = Math.floor(Date.parse(legacy.created_at || "") / 1000);
  const status = {
    type: "status",
    id,
    url: `https://x.com/${author.screen_name}/status/${id}`,
    text: String(legacy.full_text || legacy.text || ""),
    created_timestamp: Number.isFinite(createdTimestamp) ? createdTimestamp : 0,
    views: Number(result.views && result.views.count || 0),
    likes: Number(legacy.favorite_count || 0),
    reposts: Number(legacy.retweet_count || 0),
    replies: Number(legacy.reply_count || 0),
    author,
    media: { videos }
  };
  const quoteResult = result.quoted_status_result && result.quoted_status_result.result;
  if (quoteResult) {
    const quote = convertGraphqlTweet(quoteResult);
    if (quote) status.quote = quote;
  }
  return status;
}

export function extractGraphqlVideoStatuses(payload, limit = 20) {
  const results = [];
  const seenTweets = new Set();
  const visited = new Set();

  function add(value) {
    const status = convertGraphqlTweet(value);
    if (!status || seenTweets.has(status.id)) return;
    seenTweets.add(status.id);
    results.push(status);
  }

  function walk(value, depth) {
    if (!value || typeof value !== "object" || depth > 18 || visited.has(value) || results.length >= limit) return;
    visited.add(value);
    if (value.tweet_results && value.tweet_results.result) add(value.tweet_results.result);
    if (value.tweetResult && value.tweetResult.result) add(value.tweetResult.result);
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    Object.keys(value).forEach((key) => walk(value[key], depth + 1));
  }

  walk(payload, 0);
  return results.slice(0, limit);
}
