export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, channel, language } = req.query;
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
    const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));
    const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));

    // Filter channels if query
    let filteredChannels = channels;

    if (channel) {
      const q = channel.toLowerCase();
      filteredChannels = filteredChannels.filter(c => (c.name || "").toLowerCase().includes(q));
    }

    // Merge feeds and streams
    const enrichedChannels = filteredChannels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id);

      // Merge languages from channel and feeds
      let langs = ch.languages?.map(code => languagesMap[code] || code) || [];
      const feedLangs = chFeeds.flatMap(f => f.languages?.map(code => languagesMap[code] || code) || []);
      langs = [...new Set([...langs, ...feedLangs])];

      // Merge streams from feeds
      const chStreams = chFeeds.flatMap(f => {
        const fStreams = streams.filter(s => s.feed === f.id || s.channel === f.channel).map(s => ({
          id: s.quality || "SD",
          name: s.quality || "SD",
          is_main: s.quality === "SD",
          broadcast_area: f.broadcast_area || [],
          timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
          languages: f.languages?.map(code => languagesMap[code] || code) || [],
          format: s.quality || "576i",
          url: s.url || null
        }));
        return fStreams.length ? fStreams : [{
          id: "SD",
          name: "SD",
          is_main: true,
          broadcast_area: f.broadcast_area || [],
          timezones: f.timezones?.map(t => timezonesMap[t] || t) || [],
          languages: f.languages?.map(code => languagesMap[code] || code) || [],
          format: "576i",
          url: null
        }];
      });

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
        streams: chStreams.length ? chStreams : [{
          id: "SD",
          name: "SD",
          is_main: true,
          broadcast_area: ch.broadcast_area || [],
          timezones: ch.timezones?.map(t => timezonesMap[t] || t) || [],
          languages: langs,
          format: "576i",
          url: null
        }]
      };
    });

    // Apply language filter
    let finalData = enrichedChannels;
    if (language) {
      const langQuery = language.toLowerCase();
      finalData = enrichedChannels.filter(ch =>
        ch.languages.some(l => l.toLowerCase().includes(langQuery)) ||
        ch.streams.some(s => s.languages?.some(l => l.toLowerCase().includes(langQuery)))
      );
    }

    // Apply limit
    if (limit && limit.toLowerCase() !== "all") {
      const n = parseInt(limit);
      if (!isNaN(n)) finalData = finalData.slice(0, n);
    }

    res.status(200).json({ count: finalData.length, data: finalData });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch or merge IPTV data" });
  }
}
