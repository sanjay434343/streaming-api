// File: pages/api/suggestions.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { q, limit } = req.query; // q = query string from user
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = [
    "channels.json",
    "feeds.json",
    "languages.json",
    "categories.json",
    "countries.json",
    "timezones.json",
    "streams.json"
  ];

  try {
    const [channels, feeds, languages, categories, countries, timezones, streams] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
    const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));

    let suggestions = {
      channels: [],
      languages: [],
      categories: []
    };

    if (q) {
      const query = q.toLowerCase();

      // Channels with full info + streams
      suggestions.channels = channels
        .filter(c => (c.name || "").toLowerCase().includes(query))
        .slice(0, limit ? parseInt(limit) : 5)
        .map(ch => {
          const chFeeds = feeds.filter(f => f.channel === ch.id);

          // Merge languages from channel + feeds
          let langs = ch.languages?.map(code => languagesMap[code] || code) || [];
          const feedLangs = chFeeds.flatMap(f => f.languages?.map(code => languagesMap[code] || code) || []);
          langs = [...new Set([...langs, ...feedLangs])];

          // Merge streams from feeds
          const chStreams = chFeeds.flatMap(f => {
            const fStreams = streams
              .filter(s => s.feed === f.id || s.channel === f.channel)
              .map(s => ({
                url: s.url || null,
                quality: s.quality || "SD",
                broadcast_area: f.broadcast_area || [],
                timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
                languages: f.languages?.map(code => languagesMap[code] || code) || []
              }));
            return fStreams.length ? fStreams : [{
              url: null,
              quality: "SD",
              broadcast_area: f.broadcast_area || [],
              timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
              languages: f.languages?.map(code => languagesMap[code] || code) || []
            }];
          });

          return {
            id: ch.id,
            name: ch.name,
            country: countriesMap[ch.country] || null,
            languages: langs,
            categories: ch.categories?.map(cid => categoriesMap[cid] || cid) || [],
            streams: chStreams
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
