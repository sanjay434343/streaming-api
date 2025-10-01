import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { limit, quality, channel } = req.query;

  try {
    const response = await fetch('https://iptv-org.github.io/api/streams.json');
    let streams = await response.json();

    // Filter by quality if provided
    if (quality) {
      streams = streams.filter(s => s.quality && s.quality.toLowerCase() === quality.toLowerCase());
    }

    // Filter by channel if provided
    if (channel) {
      streams = streams.filter(s => s.channel && s.channel.toLowerCase().includes(channel.toLowerCase()));
    }

    // Limit results if 'limit' param is provided
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n)) {
        streams = streams.slice(0, n);
      }
    }

    res.status(200).json({ count: streams.length, data: streams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
}
