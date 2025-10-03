// File: pages/api/channel-streams.js

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cache = null;
let cacheTimestamp = 0;

// Helper function to escape XML special characters
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  // Enhanced CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { 
    limit, 
    language, 
    channel, 
    country, 
    category, 
    network, 
    nsfw,
    sort = "name",
    order = "asc",
    export: exportFormat
  } = req.query;

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
    let apiData;
    const now = Date.now();

    // Use cached data if available and fresh
    if (cache && (now - cacheTimestamp) < CACHE_DURATION) {
      apiData = cache;
    } else {
      // Fetch with timeout and parallel requests
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      apiData = await Promise.all(
        files.map(f => 
          fetch(API_BASE + f, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status} for ${f}`);
            return r.json();
          })
        )
      );

      clearTimeout(timeout);
      cache = apiData;
      cacheTimestamp = now;
    }

    const [channels, feeds, languages, categories, countries, logos, timezones, streams] = apiData;

    // Optimized maps using Map instead of Object
    const languagesMap = new Map(languages.map(l => [l.code, l.name]));
    const categoriesMap = new Map(categories.map(c => [c.id, c.name]));
    const countriesMap = new Map(countries.map(c => [c.code, c.name]));
    const timezonesMap = new Map(timezones.map(t => [t.id, t.name]));
    const logosMap = new Map(logos.map(l => [l.channel, l.url]));

    // Index feeds and streams by channel for O(1) lookup
    const feedsByChannel = new Map();
    const streamsByChannel = new Map();

    feeds.forEach(f => {
      if (!feedsByChannel.has(f.channel)) feedsByChannel.set(f.channel, []);
      feedsByChannel.get(f.channel).push(f);
    });

    streams.forEach(s => {
      if (!streamsByChannel.has(s.channel)) streamsByChannel.set(s.channel, []);
      streamsByChannel.get(s.channel).push(s);
    });

    let filteredChannels = channels;

    // Apply filters
    if (channel) {
      const chQuery = channel.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.name.toLowerCase().includes(chQuery) || 
        (c.alt_names || []).some(a => a.toLowerCase().includes(chQuery))
      );
    }

    if (language) {
      const langQuery = language.toLowerCase();
      filteredChannels = filteredChannels.filter(c => {
        const chLangs = (c.languages || []).map(code => 
          (languagesMap.get(code) || code).toLowerCase()
        );
        const chFeeds = feedsByChannel.get(c.id) || [];
        const feedLangs = chFeeds.flatMap(f => 
          (f.languages || []).map(code => (languagesMap.get(code) || code).toLowerCase())
        );
        return [...chLangs, ...feedLangs].some(l => l.includes(langQuery));
      });
    }

    if (country) {
      const countryQuery = country.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.country && countriesMap.get(c.country)?.toLowerCase().includes(countryQuery)
      );
    }

    if (category) {
      const catQuery = category.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        (c.categories || []).some(cid => 
          categoriesMap.get(cid)?.toLowerCase().includes(catQuery)
        )
      );
    }

    if (network) {
      const netQuery = network.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.network?.toLowerCase().includes(netQuery)
      );
    }

    if (nsfw !== undefined) {
      const isNsfw = nsfw === "true" || nsfw === "1";
      filteredChannels = filteredChannels.filter(c => c.is_nsfw === isNsfw);
    }

    // Sorting
    filteredChannels.sort((a, b) => {
      let aVal, bVal;
      
      switch(sort) {
        case "name":
          aVal = (a.name || "").toLowerCase();
          bVal = (b.name || "").toLowerCase();
          break;
        case "country":
          aVal = countriesMap.get(a.country) || "";
          bVal = countriesMap.get(b.country) || "";
          break;
        case "launched":
          aVal = a.launched || "";
          bVal = b.launched || "";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });

    // Apply limit
    const numericLimit = parseInt(limit, 10);
    if (!isNaN(numericLimit) && numericLimit > 0) {
      filteredChannels = filteredChannels.slice(0, numericLimit);
    }

    // Build response data
    const data = filteredChannels.map(ch => {
      const chFeeds = feedsByChannel.get(ch.id) || [];
      const chStreams = streamsByChannel.get(ch.id) || [];

      // Deduplicate languages
      const langSet = new Set([
        ...(ch.languages || []).map(code => languagesMap.get(code) || code),
        ...chFeeds.flatMap(f => (f.languages || []).map(code => languagesMap.get(code) || code))
      ]);

      const processedStreams = chStreams.map(s => ({
        id: s.quality || "SD",
        name: s.quality || "SD",
        is_main: s.quality === "SD",
        broadcast_area: s.broadcast_area || [],
        timezones: (s.timezones || []).map(t => timezonesMap.get(t) || t),
        languages: Array.from(langSet),
        format: s.quality || "576i",
        url: s.url || null,
        http_referrer: s.http_referrer || null,
        user_agent: s.user_agent || null
      }));

      return {
        id: ch.id,
        name: ch.name || "Unknown",
        alt_names: ch.alt_names || [],
        network: ch.network || null,
        owners: ch.owners || [],
        country: countriesMap.get(ch.country) || null,
        subdivision: ch.subdivision || null,
        city: ch.city || null,
        broadcast_area: ch.broadcast_area || [],
        timezones: (ch.timezones || []).map(t => timezonesMap.get(t) || t),
        languages: Array.from(langSet),
        categories: (ch.categories || []).map(cid => categoriesMap.get(cid) || cid),
        is_nsfw: ch.is_nsfw || false,
        launched: ch.launched || null,
        closed: ch.closed || null,
        replaced_by: ch.replaced_by || null,
        website: ch.website || null,
        logo: logosMap.get(ch.id) || null,
        streams: processedStreams
      };
    });

    // Handle export formats
    if (exportFormat) {
      const format = exportFormat.toLowerCase();
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `iptv-channels-${timestamp}`;

      switch(format) {
        case 'json':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(JSON.stringify({ 
            count: data.length, 
            total: channels.length,
            exported_at: new Date().toISOString(),
            data 
          }, null, 2));

        case 'csv':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
          res.setHeader('Content-Type', 'text/csv');
          
          const csvHeaders = [
            'ID', 'Name', 'Network', 'Country', 'Languages', 'Categories', 
            'Is NSFW', 'Launched', 'Website', 'Logo', 'Stream URLs'
          ];
          
          const csvRows = data.map(ch => [
            ch.id,
            `"${ch.name.replace(/"/g, '""')}"`,
            `"${ch.network || ''}"`,
            `"${ch.country || ''}"`,
            `"${ch.languages.join(', ')}"`,
            `"${ch.categories.join(', ')}"`,
            ch.is_nsfw,
            ch.launched || '',
            `"${ch.website || ''}"`,
            `"${ch.logo || ''}"`,
            `"${ch.streams.map(s => s.url).filter(Boolean).join(' | ')}"`
          ].join(','));
          
          const csv = [csvHeaders.join(','), ...csvRows].join('\n');
          return res.status(200).send(csv);

        case 'm3u':
        case 'm3u8':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.m3u"`);
          res.setHeader('Content-Type', 'audio/x-mpegurl');
          
          let m3u = '#EXTM3U\n';
          data.forEach(ch => {
            ch.streams.forEach(stream => {
              if (stream.url) {
                const attrs = [
                  `tvg-id="${ch.id}"`,
                  `tvg-name="${ch.name}"`,
                  ch.logo ? `tvg-logo="${ch.logo}"` : '',
                  ch.country ? `tvg-country="${ch.country}"` : '',
                  ch.languages.length ? `tvg-language="${ch.languages[0]}"` : '',
                  `group-title="${ch.categories[0] || 'General'}"`
                ].filter(Boolean).join(' ');
                
                m3u += `#EXTINF:-1 ${attrs},${ch.name}\n`;
                m3u += `${stream.url}\n`;
              }
            });
          });
          return res.status(200).send(m3u);

        case 'xml':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
          res.setHeader('Content-Type', 'application/xml');
          
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n';
          data.forEach(ch => {
            xml += '  <channel>\n';
            xml += `    <id>${escapeXml(ch.id)}</id>\n`;
            xml += `    <name>${escapeXml(ch.name)}</name>\n`;
            if (ch.network) xml += `    <network>${escapeXml(ch.network)}</network>\n`;
            if (ch.country) xml += `    <country>${escapeXml(ch.country)}</country>\n`;
            xml += `    <languages>${escapeXml(ch.languages.join(', '))}</languages>\n`;
            xml += `    <categories>${escapeXml(ch.categories.join(', '))}</categories>\n`;
            xml += `    <nsfw>${ch.is_nsfw}</nsfw>\n`;
            if (ch.logo) xml += `    <logo>${escapeXml(ch.logo)}</logo>\n`;
            if (ch.website) xml += `    <website>${escapeXml(ch.website)}</website>\n`;
            xml += '    <streams>\n';
            ch.streams.forEach(s => {
              if (s.url) {
                xml += `      <stream quality="${escapeXml(s.quality || 'SD')}">${escapeXml(s.url)}</stream>\n`;
              }
            });
            xml += '    </streams>\n';
            xml += '  </channel>\n';
          });
          xml += '</channels>';
          return res.status(200).send(xml);

        case 'txt':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
          res.setHeader('Content-Type', 'text/plain');
          
          let txt = `IPTV Channels Export\nGenerated: ${new Date().toISOString()}\n`;
          txt += `Total Channels: ${data.length}\n\n`;
          txt += '='.repeat(80) + '\n\n';
          
          data.forEach((ch, i) => {
            txt += `[${i + 1}] ${ch.name}\n`;
            txt += `    ID: ${ch.id}\n`;
            if (ch.network) txt += `    Network: ${ch.network}\n`;
            if (ch.country) txt += `    Country: ${ch.country}\n`;
            if (ch.languages.length) txt += `    Languages: ${ch.languages.join(', ')}\n`;
            if (ch.categories.length) txt += `    Categories: ${ch.categories.join(', ')}\n`;
            if (ch.website) txt += `    Website: ${ch.website}\n`;
            if (ch.streams.length) {
              txt += `    Streams:\n`;
              ch.streams.forEach(s => {
                if (s.url) txt += `      - ${s.name}: ${s.url}\n`;
              });
            }
            txt += '\n';
          });
          return res.status(200).send(txt);

        default:
          return res.status(400).json({ 
            error: "Invalid export format",
            supported: ["json", "csv", "m3u", "m3u8", "xml", "txt"]
          });
      }
    }

    // Normal JSON response
    res.status(200).json({ 
      count: data.length, 
      total: channels.length,
      filters_applied: {
        channel: !!channel,
        language: !!language,
        country: !!country,
        category: !!category,
        network: !!network,
        nsfw: nsfw !== undefined
      },
      data 
    });

  } catch (error) {
    console.error("API Error:", error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: "Request timeout" });
    }

    res.status(500).json({ 
      error: "Failed to fetch or merge IPTV data",
      message: error.message 
    });
  }
}
