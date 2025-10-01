export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { limit, language } = req.query;
  const API_BASE = "https://iptv-org.github.io/api/";

  const files = [
    "channels.json",
    "feeds.json",
    "languages.json",
    "streams.json"
  ];

  try {
    const [channels, feeds, languagesData, streams] =
      await Promise.all(files.map(f => fetch(API_BASE + f).then(r => r.json())));

    // Map languages for quick lookup
    const languagesMap = Object.fromEntries(languagesData.map(l => [l.code, l.name]));

    // Build channel data with streams and feed languages
    let enrichedChannels = channels.map(ch => {
      const chFeeds = feeds.filter(f => f.channel === ch.id);

      // Determine languages: from channel first, then from feeds
      let langs = ch.languages?.map(c => languagesMap[c] || c) || [];
      if (!langs.length) {
        langs = [...new Set(chFeeds.flatMap(f => (f.languages || []).map(c => languagesMap[c] || c)))];
      }

      // Merge streams
      const allStreams = chFeeds.flatMap(f => streams
        .filter(s => s.feed === f.id || s.channel === f.channel)
        .map(s => ({
          id: s.quality || "SD",
          name: s.quality || "SD",
          is_main: s.quality === "SD",
          languages: f.languages?.map(c => languagesMap[c] || c) || langs,
          format: s.quality || "576i",
          url: s.url || null
        }))
      );

      // Placeholder SD if no streams
      const streamsData = allStreams.length ? allStreams : [{
        id: "SD",
        name: "SD",
        is_main: true,
        languages: langs,
        format: "576i",
        url: null
      }];

      return {
        id: ch.id,
        name: ch.name || "Unknown",
        languages: langs,
        streams: streamsData
      };
    });

    // Filter by language if provided
    if (language) {
      const langQuery = language.toLowerCase();
      enrichedChannels = enrichedChannels.filter(ch =>
        ch.languages.some(l => l.toLowerCase().includes(langQuery))
      );
    }

    // Apply limit
    if (limit && limit.toLowerCase() !== "all") {
      const n = parseInt(limit);
      if (!isNaN(n)) enrichedChannels = enrichedChannels.slice(0, n);
    }

    res.status(200).json({ count: enrichedChannels.length, data: enrichedChannels });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch or merge IPTV data" });
  }
}
