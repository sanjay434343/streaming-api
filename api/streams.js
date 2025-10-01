// File: pages/api/channel-streams.js
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
    "logos.json",
    "timezones.json",
    "streams.json"
  ];

  try {
    const [channels, feeds, languages, categories, countries, logos, timezones, streams] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
    const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));
    const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));

    // Filter channels by language if provided
    let filteredChannels = channels;
    if (language) {
      const langQuery = language.toLowerCase();
      filteredChannels = filteredChannels.filter(c => {
        const chLangs = c.languages?.map(code => (languagesMap[code] || code).toLowerCase()) || [];
        const feedLangs = feeds
          .filter(f => f.channel === c.id)
          .flatMap(f => f.languages?.map(code => (languagesMap[code] || code).toLowerCase()) || []);
        const allLangs = [...new Set([...chLangs, ...feedLangs])];
        return allLangs.includes(langQuery);
      });
    }

    // Strictly respect the 'limit' query (default to all if not provided)
    const numericLimit = parseInt(limit, 10);
    if (!isNaN(numericLimit) && numericLimit > 0) {
      filteredChannels = filteredChannels.slice(0, numericLimit);
    }

    const data = filteredChannels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id);

      // Merge languages
      let langs = ch.languages?.map(code => languagesMap[code] || code) || [];
      const feedLangs = chFeeds.flatMap(f => f.languages?.map(code => languagesMap[code] || code) || []);
      langs = [...new Set([...langs, ...feedLangs])];

      // Only include streams where stream.channel matches the channel id
      const chStreams = streams
        .filter(s => s.channel === ch.id)
        .map(s => ({
          id: s.quality || "SD",
          name: s.quality || "SD",
          is_main: s.quality === "SD",
          broadcast_area: [],
          timezones: [],
          languages: langs,
          format: s.quality || "576i",
          url: s.url || null
        }));

      return {
        id: ch.id,
        name: ch.name || "Unknown",
        alt_names: ch.alt_names || [],
        network: ch.network || null,
        owners: ch.owners || [],
        country: countriesMap[ch.country] || null,
        broadcast_area: ch.broadcast_area || [],
        timezones: ch.timezones?.map(t => timezonesMap[t] || t) || [],
        languages: langs,
        categories: ch.categories?.map(cid => categoriesMap[cid] || cid) || [],
        is_nsfw: ch.is_nsfw || false,
        launched: ch.launched || null,
        website: ch.website || null,
        logo: logosMap[ch.id] || null,
        streams: chStreams
      };
    });

    res.status(200).json({ count: data.length, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch or merge IPTV data" });
  }
}
