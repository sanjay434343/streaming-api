export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { limit, channel } = req.query;
  const baseUrl = 'https://iptv-org.github.io/api';

  const files = [
    'channels.json',
    'categories.json',
    'countries.json',
    'languages.json',
    'timezones.json',
    'logos.json',
    'streams.json'
  ];

  try {
    const [channels, categories, countries, languages, timezones, logos, streams] =
      await Promise.all(files.map(f => fetch(`${baseUrl}/${f}`).then(r => r.json())));

    // Maps for quick lookup
    const channelsMap = {};
    channels.forEach(c => channelsMap[c.id] = c);

    const categoriesMap = {};
    categories.forEach(c => categoriesMap[c.id] = c);

    const countriesMap = {};
    countries.forEach(c => countriesMap[c.id] = c);

    const languagesMap = {};
    languages.forEach(l => languagesMap[l.id] = l);

    const timezonesMap = {};
    timezones.forEach(t => timezonesMap[t.id] = t);

    const logosMap = {};
    logos.forEach(l => logosMap[l.channel_id] = l);

    // Merge streams with channel metadata
    let merged = streams.map((s, index) => {
      const ch = channelsMap[s.channel] || {}; // Always include stream

      const channelLanguages = (ch.languages || []).map(id => languagesMap[id]?.name).filter(Boolean);
      const channelCategories = (ch.categories || []).map(id => categoriesMap[id]?.name).filter(Boolean);
      const channelTimezones = (ch.timezones || []).map(id => timezonesMap[id]?.name).filter(Boolean);

      return {
        id: index + 1,
        channel_id: s.channel,
        name: ch.name || s.title || s.channel,
        alt_names: ch.alt_names || null,
        network: ch.network || null,
        owners: ch.owners || null,
        country: countriesMap[ch.country]?.name || null,
        broadcast_area: ch.broadcast_area || null,
        timezones: channelTimezones || null,
        languages: channelLanguages || null,
        categories: channelCategories || null,
        is_nsfw: ch.is_nsfw || false,
        formats: [s.quality].filter(Boolean),
        launched: ch.launched || null,
        website: ch.website || null,
        logo: logosMap[s.channel]?.url || null,
        streams: [
          {
            id: s.quality || 'SD',
            name: s.quality || 'SD',
            is_main: true,
            broadcast_area: ch.broadcast_area || null,
            timezones: channelTimezones || null,
            languages: channelLanguages || null,
            format: s.quality || '576i',
            url: s.url || null
          }
        ]
      };
    });

    // Filter by channel name
    if (channel) {
      merged = merged.filter(c => c.name.toLowerCase().includes(channel.toLowerCase()));
    }

    // Apply limit
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n)) merged = merged.slice(0, n);
    }

    res.status(200).json({ count: merged.length, data: merged });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch or merge IPTV data' });
  }
}
