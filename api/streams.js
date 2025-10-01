export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, channel, language, quality, country, category, network, owner } = req.query;
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

    // Merge feeds and streams
    const mergedChannels = channels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id);

      // Collect languages from channel and feeds
      let langs = ch.languages?.map(code => languagesMap[code] || code) || [];
      const feedLangs = chFeeds.flatMap(f => f.languages?.map(code => languagesMap[code] || code) || []);
      langs = [...new Set([...langs, ...feedLangs])];

      // Merge streams
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
        streams: chStreams
      };
    });

    // Apply advanced filtering
    let filtered = mergedChannels.filter(ch => {
      if (channel && !ch.name.toLowerCase().includes(channel.toLowerCase())) return false;
      if (language && !ch.languages.some(l => l.toLowerCase().includes(language.toLowerCase()))) return false;
      if (category && !ch.categories.some(c => c.toLowerCase().includes(category.toLowerCase()))) return false;
      if (country && (!ch.country || !ch.country.toLowerCase().includes(country.toLowerCase()))) return false;
      if (network && (!ch.network || !ch.network.toLowerCase().includes(network.toLowerCase()))) return false;
      if (owner && !ch.owners.some(o => o.toLowerCase().includes(owner.toLowerCase()))) return false;

      if (quality) {
        const q = quality.toLowerCase();
        if (!ch.streams.some(s => s.format.toLowerCase().includes(q))) return false;
      }

      return true;
    });

    // Apply limit
    if (limit && limit.toLowerCase() !== "all") {
      const n = parseInt(limit);
      if (!isNaN(n)) filtered = filtered.slice(0, n);
    }

    res.status(200).json({ count: filtered.length, data: filtered });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch or merge IPTV data" });
  }
}
