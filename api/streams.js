export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { limit, channel } = req.query;
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = [
    "channels.json",
    "feeds.json",
    "languages.json",
    "categories.json",
    "countries.json",
    "logos.json",
    "timezones.json"
  ];

  try {
    // Fetch all files in parallel
    const [channels, feeds, languages, categories, countries, logos, timezones] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    // Map data for faster lookup
    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const countriesMap = Object.fromEntries(countries.map(c => [c.code, c.name]));
    const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));
    const timezonesMap = Object.fromEntries(timezones.map(t => [t.id, t.name]));

    // Filter channels if query
    let filteredChannels = channels;
    if (channel) {
      const q = channel.toLowerCase();
      filteredChannels = channels.filter(c => c.name && c.name.toLowerCase().includes(q));
    }

    // Apply limit
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n)) filteredChannels = filteredChannels.slice(0, n);
    }

    // Merge each channel with feeds, logos, languages, categories
    const merged = filteredChannels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id).map(f => ({
        id: f.id,
        name: f.name,
        url: f.url,
        format: f.format,
        languages: f.languages?.map(code => languagesMap[code] || code) || [],
        broadcast_area: f.broadcast_area || [],
        timezones: f.timezones || []
      }));

      return {
        id: ch.id,
        name: ch.name,
        alt_names: ch.alt_names || null,
        network: ch.network || null,
        owners: ch.owners || [],
        country: countriesMap[ch.country] || null,
        broadcast_area: ch.broadcast_area || [],
        timezones: ch.timezones?.map(t => timezonesMap[t] || t) || [],
        languages: ch.languages?.map(code => languagesMap[code] || code) || [],
        categories: ch.categories?.map(cid => categoriesMap[cid] || cid) || [],
        is_nsfw: ch.is_nsfw || false,
        launched: ch.launched || null,
        website: ch.website || null,
        logo: logosMap[ch.id] || null,
        feeds: chFeeds
      };
    });

    res.status(200).json({ count: merged.length, data: merged });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch or merge IPTV data" });
  }
}
