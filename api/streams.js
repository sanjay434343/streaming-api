let cachedData = null;
let lastFetchTime = 0;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, channel, language } = req.query;
  const API_BASE = "https://iptv-org.github.io/api/";
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour cache

  // Fetch & cache data if empty or expired
  if (!cachedData || Date.now() - lastFetchTime > CACHE_TTL) {
    try {
      const files = [
        "channels.json",
        "feeds.json",
        "languages.json",
        "categories.json",
        "countries.json",
        "logos.json",
        "timezones.json",
        "streams.json"
      ];

      const [channels, feeds, languages, categories, countries, logos, timezones, streams] =
        await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

      cachedData = { channels, feeds, languages, categories, countries, logos, timezones, streams };
      lastFetchTime = Date.now();
      console.log("✅ IPTV data cached");
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to fetch IPTV data" });
    }
  }

  const { channels, feeds, languages, categories, countries, logos, timezones, streams } = cachedData;

  // Create maps for fast lookup
  const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
  const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
  const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));
  const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));

  // Filter & enrich channels
  let enriched = channels.map(ch => {
    const chFeeds = feeds.filter(f => f.channel === ch.id);

    let langs = ch.languages?.map(c => languagesMap[c] || c) || [];
    const feedLangs = chFeeds.flatMap(f => f.languages?.map(c => languagesMap[c] || c) || []);
    langs = [...new Set([...langs, ...feedLangs])];

    const chStreams = chFeeds.flatMap(f => {
      const fStreams = streams.filter(s => s.feed === f.id || s.channel === f.channel).map(s => ({
        id: s.quality || "SD",
        name: s.quality || "SD",
        is_main: s.quality === "SD",
        broadcast_area: f.broadcast_area || [],
        timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
        languages: f.languages?.map(c => languagesMap[c] || c) || [],
        format: s.quality || "576i",
        url: s.url || null
      }));
      return fStreams.length ? fStreams : [{
        id: "SD",
        name: "SD",
        is_main: true,
        broadcast_area: f.broadcast_area || [],
        timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
        languages: f.languages?.map(c => languagesMap[c] || c) || [],
        format: "576i",
        url: null
      }];
    });

    return {
      id: ch.id,
      name: ch.name,
      languages: langs,
      categories: ch.categories?.map(cid => categoriesMap[cid] || cid) || [],
      streams: chStreams
    };
  });

  // Apply filters
  if (channel) enriched = enriched.filter(c => c.name.toLowerCase().includes(channel.toLowerCase()));
  if (language) enriched = enriched.filter(c => 
    c.languages.some(l => l.toLowerCase().includes(language.toLowerCase())) ||
    c.streams.some(s => s.languages?.some(l => l.toLowerCase().includes(language.toLowerCase())))
  );

  if (limit && limit.toLowerCase() !== "all") {
    const n = parseInt(limit);
    if (!isNaN(n)) enriched = enriched.slice(0, n);
  }

  res.status(200).json({ count: enriched.length, data: enriched });
}
