// File: pages/api/streams-only.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { limit, channel, language } = req.query;
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = ["channels.json", "feeds.json", "languages.json", "streams.json", "logos.json"];
  
  try {
    const [channels, feeds, languages, streams, logos] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    const languagesMap = Object.fromEntries(languages.map(l => [l.code, l.name]));
    const logosMap = Object.fromEntries(logos.map(l => [l.channel, l.url]));

    // Filter channels by name
    let filteredChannels = channels;
    if (channel) {
      const q = channel.toLowerCase();
      filteredChannels = filteredChannels.filter(c => (c.name || "").toLowerCase().includes(q));
    }

    // Filter channels by language
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

    // Apply limit
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n)) filteredChannels = filteredChannels.slice(0, n);
    }

    // Prepare simplified response with only streams
    const data = filteredChannels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id);

      const chStreams = chFeeds.flatMap(f =>
        streams
          .filter(s => s.feed === f.id || s.channel === f.channel)
          .map(s => ({ url: s.url, quality: s.quality || "SD" }))
      );

      return {
        id: ch.id,
        name: ch.name,
        logo: logosMap[ch.id] || null,
        streams: chStreams.length ? chStreams : [{ url: null, quality: "SD" }]
      };
    });

    res.status(200).json({ count: data.length, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch streams" });
  }
}
