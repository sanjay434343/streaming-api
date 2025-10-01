let cachedData = null;
let lastFetch = 0;

const API_BASE = "https://iptv-org.github.io/api/";
const files = [
  "channels.json",
  "feeds.json",
  "streams.json",
  "languages.json",
  "categories.json",
  "countries.json",
  "logos.json",
  "timezones.json"
];

// Fetch and cache data (refresh every 1 hour)
async function fetchAll() {
  const now = Date.now();
  if (cachedData && now - lastFetch < 3600_000) return cachedData;

  const [
    channels,
    feeds,
    streams,
    languages,
    categories,
    countries,
    logos,
    timezones
  ] = await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

  const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
  const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
  const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));
  const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));

  // Merge feeds with streams
  const feedsMap = feeds.map(f => {
    const fStreams = streams
      .filter(s => s.feed === f.id || s.channel === f.channel)
      .map(s => ({
        id: s.quality || "SD",
        name: s.quality || "SD",
        is_main: s.quality === "SD",
        broadcast_area: s.broadcast_area || [],
        timezones: s.timezones || [],
        languages: s.languages || [],
        format: s.quality || "576i",
        url: s.url || null
      }));
    return { ...f, streams: fStreams };
  });

  cachedData = { channels, feedsMap, languagesMap, categoriesMap, countriesMap, logosMap, timezonesMap };
  lastFetch = now;
  return cachedData;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, channel, language, category, country, network, owner } = req.query;

  try {
    const { channels, feedsMap, languagesMap, categoriesMap, countriesMap, logosMap, timezonesMap } =
      await fetchAll();

    let enrichedChannels = channels.map(ch => {
      const chFeeds = feedsMap.filter(f => f.channel === ch.id);

      let langs = ch.languages?.map(c => languagesMap[c] || c) || [];
      if (!langs.length) {
        langs = [...new Set(chFeeds.flatMap(f => f.languages.map(c => languagesMap[c] || c)))];
      }

      const allStreams = chFeeds.flatMap(f => f.streams.length ? f.streams : [{
        id: "SD",
        name: "SD",
        is_main: true,
        broadcast_area: f.broadcast_area || [],
        timezones: f.timezones || [],
        languages: f.languages || [],
        format: "576i",
        url: null
      }]);

      const mainStream = allStreams.find(s => s.format?.includes("1080")) ||
                         allStreams.find(s => s.format?.includes("720")) ||
                         allStreams[0];

      const chCategories = ch.categories?.map(cid => categoriesMap[cid] || cid) || [];

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
        categories: chCategories.length ? chCategories : ["General"],
        is_nsfw: ch.is_nsfw || false,
        launched: ch.launched || null,
        website: ch.website || null,
        logo: logosMap[ch.id] || null,
        streams: allStreams,
        main_stream: mainStream
      };
    });

    // Advanced filtering
    enrichedChannels = enrichedChannels.filter(ch => {
      if (channel && !ch.name.toLowerCase().includes(channel.toLowerCase())) return false;
      if (language && !ch.languages.some(l => l.toLowerCase().includes(language.toLowerCase()))) return false;
      if (category && !ch.categories.some(c => c.toLowerCase().includes(category.toLowerCase()))) return false;
      if (country && (!ch.country || !ch.country.toLowerCase().includes(country.toLowerCase()))) return false;
      if (network && (!ch.network || !ch.network.toLowerCase().includes(network.toLowerCase()))) return false;
      if (owner && !ch.owners.some(o => o.toLowerCase().includes(owner.toLowerCase()))) return false;
      return true;
    });

    // Limit results
    if (limit && limit.toLowerCase() !== "all") {
      const n = parseInt(limit);
      if (!isNaN(n)) enrichedChannels = enrichedChannels.slice(0, n);
    }

    res.status(200).json({ count: enrichedChannels.length, data: enrichedChannels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch IPTV data" });
  }
}
