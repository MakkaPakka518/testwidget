WidgetMetadata = {
  id: "guduo_hot_list_makka",
  title: "骨朵热度指数榜",
  description: "每日更新的CN剧集、动漫、综艺、电影全网热度排行",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "骨朵热榜",
      description: "查看每日各大平台影视热度榜",
      functionName: "loadGuduoRank",
      requiresWebView: false,
      cacheDuration: 3600 * 6, // 缓存 6 小时
      params: [
        {
          name: "category",
          title: "榜单分类",
          type: "enumeration",
          value: "剧集",
          enumOptions: [
            { title: "陸劇", value: "剧集" },
            { title: "國漫", value: "动漫" },
            { title: "綜藝", value: "综艺" },
            { title: "電影", value: "电影" }
          ]
        },
        { name: "language", title: "语言", type: "language", value: "zh-CN" }
      ]
    }
  ]
};

/**
 * 获取并解析 GitHub Raw JSON 数据
 */
async function loadGuduoRank(params = {}) {
  try {
    const { category = "剧集" } = params;

    // GitHub Raw URL (加一个随机数时间戳防止 GitHub 强缓存)
    const baseUrl = "https://raw.githubusercontent.com/MakkaPakka518/List/refs/heads/main/data/guduo-hot.json";
    const url = `${baseUrl}?t=${Math.floor(Date.now() / 3600000)}`; // 按小时变动时间戳

    console.log(`[骨朵榜单] 开始加载: ${category}`);

    const response = await Widget.http.get(url, { decodable: true });

    // 安全解析 JSON
    let data;
    if (typeof response.data === "string") {
      try {
        data = JSON.parse(response.data);
      } catch (e) {
        console.error("[骨朵榜单] JSON 解析失败:", e);
        data = {};
      }
    } else {
      data = response.data;
    }

    // 校验数据结构
    if (!data || !data.categories || !data.categories[category]) {
      console.error(`[骨朵榜单] 数据源中未找到分类: ${category}`);
      return [];
    }

    const items = data.categories[category];
    const results = items.map(item => {
      const tmdbId = Number(item && item.tmdbId);
      const mediaType = item && item.mediaType;
      if (!tmdbId || !["movie", "tv"].includes(mediaType)) return null;
      return { id: `${mediaType}.${tmdbId}`, type: "tmdb" };
    }).filter(Boolean);

    console.log(`[骨朵榜单] 成功加载 ${results.length} 条数据`);
    return results;

  } catch (error) {
    console.error("[骨朵榜单] 请求发生错误:", error);
    throw error;
  }
}
