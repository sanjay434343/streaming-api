// File: pages/api/suggestions.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, language } = req.query; 
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = [
    "channels.json",
    "feeds.json",
    "languages.json",
    "categories.json",
    "countries.json",
    "timezones.json",
    "streams.json",
    "logos.json"
  ];

  try {
    const [channels, feeds, languages, categories, countries, timezones, streams, logos] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
    const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));
    const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));

    const MAX_SUGGESTIONS = 50;

    // Filter channels by language if provided
    let filteredChannels = channels;
    if (language) {
      const langQuery = language.toLowerCase();
      filteredChannels = channels.filter(c => {
        const chLangs = c.languages?.map(code => (languagesMap[code] || code).toLowerCase()) || [];
        const feedLangs = feeds
          .filter(f => f.channel === c.id)
          .flatMap(f => f.languages?.map(code => (languagesMap[code] || code).toLowerCase()) || []);
        const allLangs = [...new Set([...chLangs, ...feedLangs])];
        return allLangs.includes(langQuery);
      });
    }

    // Apply limit (max 50)
    const n = Math.min(MAX_SUGGESTIONS, limit ? parseInt(limit) : MAX_SUGGESTIONS);
    filteredChannels = filteredChannels.slice(0, n);

    // Prepare suggestions
    const suggestions = filteredChannels.map(ch => {
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
        logo: logosMap[ch.id] || null,
        streams: chStreams
      };
    });

    res.status(200).json({
      count: suggestions.length,
      suggestions
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
}
