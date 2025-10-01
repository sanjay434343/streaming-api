export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { limit, channel } = req.query;

  try {
    const response = await fetch('https://iptv-org.github.io/api/streams.json');
    let streams = await response.json();

    // Filter by channel name if provided
    if (channel) {
      streams = streams.filter(
        s => s.channel && s.channel.toLowerCase().includes(channel.toLowerCase())
      );
    }

    // Group streams by channel
    const grouped = {};
    streams.forEach(s => {
      const key = s.channel || s.title || `unknown-${Math.random()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    // Build structured array
    let structured = Object.keys(grouped).map((channelKey, index) => {
      const channelStreams = grouped[channelKey];

      // Sort by quality (assuming higher numbers = higher quality)
      const sortedStreams = channelStreams.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      // Map streams dynamically
      const streamsArray = sortedStreams.map((s, i) => ({
        id: s.quality || `stream-${i + 1}`,
        name: s.quality || `Stream ${i + 1}`,
        is_main: i === 0, // highest quality as main
        broadcast_area: s.broadcast_area || null,
        timezones: s.timezones || null,
        languages: s.languages || null,
        format: s.quality || null,
        url: s.url || null
      }));

      return {
        id: index + 1,
        channel_id: channelKey,
        name: channelStreams[0].title || channelKey,
        alt_names: channelStreams[0].channel_alt || null,
        network: channelStreams[0].network || null,
        owners: channelStreams[0].owners || null,
        country: channelStreams[0].country || null,
        broadcast_area: channelStreams[0].broadcast_area || null,
        timezones: channelStreams[0].timezones || null,
        languages: channelStreams[0].languages || null,
        categories: channelStreams[0].categories || null,
        is_nsfw: channelStreams[0].is_nsfw || false,
        formats: channelStreams.map(s => s.quality).filter(Boolean),
        launched: channelStreams[0].launched || null,
        website: channelStreams[0].website || null,
        streams: streamsArray
      };
    });

    // Apply limit if provided
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n)) structured = structured.slice(0, n);
    }

    res.status(200).json({ count: structured.length, data: structured });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch or process streams' });
  }
}
