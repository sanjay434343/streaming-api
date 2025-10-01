// File: pages/api/suggestions.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { q, limit } = req.query; // q = query string from user
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = [
    "channels.json",
    "languages.json",
    "categories.json",
    "streams.json"
  ];

  try {
    const [channels, languages, categories, streams] = await Promise.all(
      files.map(f => fetch(API_BASE + f).then(r => r.json()))
    );

    // Map languages and categories for name lookups
    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    let suggestions = {
      channels: [],
      languages: [],
      categories: []
    };

    if (q) {
      const query = q.toLowerCase();

      // Channels with sample stream links
      suggestions.channels = channels
        .filter(c => (c.name || "").toLowerCase().includes(query))
        .slice(0, limit ? parseInt(limit) : 5)
        .map(c => {
          // Find up to 3 streams for this channel
          const chStreams = streams
            .filter(s => s.channel === c.id || s.feed === c.id)
            .slice(0, 3)
            .map(s => ({ url: s.url, quality: s.quality || "SD" }));

          return {
            id: c.id,
            name: c.name,
            streams: chStreams.length ? chStreams : [{ url: null, quality: "SD" }]
          };
        });

      // Languages
      suggestions.languages = languages
        .filter(l => (l.name || "").toLowerCase().includes(query))
        .slice(0, limit ? parseInt(limit) : 5)
        .map(l => ({ code: l.code, name: l.name }));

      // Categories
      suggestions.categories = categories
        .filter(c => (c.name || "").toLowerCase().includes(query))
        .slice(0, limit ? parseInt(limit) : 5)
        .map(c => ({ id: c.id, name: c.name }));
    }

    res.status(200).json({
      count: suggestions.channels.length + suggestions.languages.length + suggestions.categories.length,
      suggestions
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
}
