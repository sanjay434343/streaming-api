// File: pages/api/channel-streams.js

// Enhanced cache with longer duration for stable data
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
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

// Parallel fetch with retry logic
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (i === retries) throw new Error(`HTTP ${response.status}`);
        continue;
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
}

export default async function handler(req, res) {
  // Enhanced CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
  
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
    region,
    city,
    subdivision,
    blocked,
    sort = "name",
    order = "asc",
    export: exportFormat
  } = req.query;

  const API_BASE = "https://iptv-org.github.io/api/";
  
  // All available data sources
  const files = [
    "channels.json",
    "streams.json",
    "feeds.json",
    "languages.json",
    "categories.json",
    "countries.json",
    "regions.json",
    "subdivisions.json",
    "cities.json",
    "logos.json",
    "timezones.json",
    "guides.json",
    "blocklist.json"
  ];

  try {
    let apiData;
    const now = Date.now();

    // Use cached data if available and fresh
    if (cache && (now - cacheTimestamp) < CACHE_DURATION) {
      apiData = cache;
    } else {
      // Parallel fetch all resources with retry logic
      apiData = await Promise.all(
        files.map(f => fetchWithRetry(API_BASE + f).catch(() => []))
      );
      
      cache = apiData;
      cacheTimestamp = now;
    }

    const [
      channels, streams, feeds, languages, categories, countries, 
      regions, subdivisions, cities, logos, timezones, guides, blocklist
    ] = apiData;

    // Build fast lookup Maps
    const languagesMap = new Map(languages.map(l => [l.code, l.name]));
    const categoriesMap = new Map(categories.map(c => [c.id, c.name]));
    const countriesMap = new Map(countries.map(c => [c.code, c.name]));
    const regionsMap = new Map(regions.map(r => [r.code, r.name]));
    const subdivisionsMap = new Map(subdivisions.map(s => [s.code, s.name]));
    const citiesMap = new Map(cities.map(c => [c.id, c.name]));
    const timezonesMap = new Map(timezones.map(t => [t.id, t.name]));
    const logosMap = new Map(logos.map(l => [l.channel, l.url]));
    const guidesMap = new Map(guides.map(g => [g.channel, g]));
    const blocklistSet = new Set(blocklist.map(b => b.channel));

    // Index by channel ID for O(1) lookups
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

    // Apply blocklist filter
    if (blocked !== "true") {
      filteredChannels = filteredChannels.filter(c => !blocklistSet.has(c.id));
    }

    // Channel name filter (partial match)
    if (channel) {
      const chQuery = channel.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.name.toLowerCase().includes(chQuery) || 
        (c.alt_names || []).some(a => a.toLowerCase().includes(chQuery))
      );
    }

    // Language filter
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

    // Country filter
    if (country) {
      const countryQuery = country.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.country && countriesMap.get(c.country)?.toLowerCase().includes(countryQuery)
      );
    }

    // Region filter
    if (region) {
      const regionQuery = region.toLowerCase();
      filteredChannels = filteredChannels.filter(c =>
        (c.broadcast_area || []).some(area => 
          area.startsWith('r/') && regionsMap.get(area.substring(2))?.toLowerCase().includes(regionQuery)
        )
      );
    }

    // Subdivision filter
    if (subdivision) {
      const subQuery = subdivision.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.subdivision && subdivisionsMap.get(c.subdivision)?.toLowerCase().includes(subQuery)
      );
    }

    // City filter
    if (city) {
      const cityQuery = city.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.city && citiesMap.get(c.city)?.toLowerCase().includes(cityQuery)
      );
    }

    // Category filter
    if (category) {
      const catQuery = category.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        (c.categories || []).some(cid => 
          categoriesMap.get(cid)?.toLowerCase().includes(catQuery)
        )
      );
    }

    // Network filter
    if (network) {
      const netQuery = network.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.network?.toLowerCase().includes(netQuery)
      );
    }

    // NSFW filter
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
        case "network":
          aVal = a.network || "";
          bVal = b.network || "";
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

    // Build enriched response data
    const data = filteredChannels.map(ch => {
      const chFeeds = feedsByChannel.get(ch.id) || [];
      const chStreams = streamsByChannel.get(ch.id) || [];
      const chGuide = guidesMap.get(ch.id);

      // Deduplicate languages
      const langSet = new Set([
        ...(ch.languages || []).map(code => languagesMap.get(code) || code),
        ...chFeeds.flatMap(f => (f.languages || []).map(code => languagesMap.get(code) || code))
      ]);

      // Process broadcast areas
      const broadcastAreas = (ch.broadcast_area || []).map(area => {
        if (area.startsWith('c/')) return countriesMap.get(area.substring(2)) || area;
        if (area.startsWith('r/')) return regionsMap.get(area.substring(2)) || area;
        if (area.startsWith('s/')) return subdivisionsMap.get(area.substring(2)) || area;
        return area;
      });

      // Process streams with all available data
      const processedStreams = chStreams.map(s => ({
        channel: s.channel,
        url: s.url,
        http_referrer: s.http_referrer || null,
        user_agent: s.user_agent || null,
        quality: s.quality || "SD",
        format: s.format || null,
        width: s.width || null,
        height: s.height || null,
        bitrate: s.bitrate || null,
        frame_rate: s.frame_rate || null,
        codec: s.codec || null,
        status: s.status || "online",
        added: s.added || null,
        updated: s.updated || null,
        checked: s.checked || null
      }));

      return {
        id: ch.id,
        name: ch.name || "Unknown",
        alt_names: ch.alt_names || [],
        network: ch.network || null,
        owners: ch.owners || [],
        country: countriesMap.get(ch.country) || null,
        subdivision: subdivisionsMap.get(ch.subdivision) || null,
        city: citiesMap.get(ch.city) || null,
        broadcast_area: broadcastAreas,
        timezones: (ch.timezones || []).map(t => timezonesMap.get(t) || t),
        languages: Array.from(langSet),
        categories: (ch.categories || []).map(cid => categoriesMap.get(cid) || cid),
        is_nsfw: ch.is_nsfw || false,
        launched: ch.launched || null,
        closed: ch.closed || null,
        replaced_by: ch.replaced_by || null,
        website: ch.website || null,
        logo: logosMap.get(ch.id) || null,
        is_blocked: blocklistSet.has(ch.id),
        guide: chGuide ? {
          url: chGuide.url,
          lang: chGuide.lang,
          site: chGuide.site
        } : null,
        feeds: chFeeds.length,
        streams: processedStreams,
        stream_count: processedStreams.length,
        online_streams: processedStreams.filter(s => s.status === "online").length
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
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          
          const csvHeaders = [
            'ID', 'Name', 'Network', 'Country', 'Subdivision', 'City', 'Languages', 
            'Categories', 'Is NSFW', 'Launched', 'Website', 'Logo', 'EPG', 
            'Total Streams', 'Online Streams', 'Stream URLs'
          ];
          
          const csvRows = data.map(ch => [
            ch.id,
            `"${ch.name.replace(/"/g, '""')}"`,
            `"${ch.network || ''}"`,
            `"${ch.country || ''}"`,
            `"${ch.subdivision || ''}"`,
            `"${ch.city || ''}"`,
            `"${ch.languages.join(', ')}"`,
            `"${ch.categories.join(', ')}"`,
            ch.is_nsfw,
            ch.launched || '',
            `"${ch.website || ''}"`,
            `"${ch.logo || ''}"`,
            `"${ch.guide?.url || ''}"`,
            ch.stream_count,
            ch.online_streams,
            `"${ch.streams.map(s => s.url).filter(Boolean).join(' | ')}"`
          ].join(','));
          
          const csv = [csvHeaders.join(','), ...csvRows].join('\n');
          return res.status(200).send('\ufeff' + csv); // UTF-8 BOM

        case 'm3u':
        case 'm3u8':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.m3u"`);
          res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
          
          let m3u = '#EXTM3U x-tvg-url=""\n';
          data.forEach(ch => {
            const onlineStreams = ch.streams.filter(s => s.status === "online" && s.url);
            onlineStreams.forEach((stream, idx) => {
              const attrs = [
                `tvg-id="${ch.id}"`,
                `tvg-name="${ch.name}"`,
                ch.logo ? `tvg-logo="${ch.logo}"` : '',
                ch.country ? `tvg-country="${ch.country}"` : '',
                ch.languages.length ? `tvg-language="${ch.languages[0]}"` : '',
                `group-title="${ch.categories[0] || 'General'}"`,
                stream.http_referrer ? `http-referrer="${stream.http_referrer}"` : '',
                stream.user_agent ? `http-user-agent="${stream.user_agent}"` : ''
              ].filter(Boolean).join(' ');
              
              const displayName = onlineStreams.length > 1 
                ? `${ch.name} (${stream.quality || 'Stream ' + (idx + 1)})` 
                : ch.name;
              
              m3u += `#EXTINF:-1 ${attrs},${displayName}\n`;
              m3u += `${stream.url}\n`;
            });
          });
          return res.status(200).send(m3u);

        case 'xml':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n';
          data.forEach(ch => {
            xml += '  <channel>\n';
            xml += `    <id>${escapeXml(ch.id)}</id>\n`;
            xml += `    <name>${escapeXml(ch.name)}</name>\n`;
            if (ch.network) xml += `    <network>${escapeXml(ch.network)}</network>\n`;
            if (ch.country) xml += `    <country>${escapeXml(ch.country)}</country>\n`;
            if (ch.city) xml += `    <city>${escapeXml(ch.city)}</city>\n`;
            xml += `    <languages>${escapeXml(ch.languages.join(', '))}</languages>\n`;
            xml += `    <categories>${escapeXml(ch.categories.join(', '))}</categories>\n`;
            xml += `    <nsfw>${ch.is_nsfw}</nsfw>\n`;
            if (ch.logo) xml += `    <logo>${escapeXml(ch.logo)}</logo>\n`;
            if (ch.website) xml += `    <website>${escapeXml(ch.website)}</website>\n`;
            if (ch.guide) xml += `    <epg>${escapeXml(ch.guide.url)}</epg>\n`;
            xml += '    <streams>\n';
            ch.streams.forEach(s => {
              if (s.url) {
                xml += `      <stream quality="${escapeXml(s.quality)}" status="${s.status}">\n`;
                xml += `        <url>${escapeXml(s.url)}</url>\n`;
                if (s.http_referrer) xml += `        <referrer>${escapeXml(s.http_referrer)}</referrer>\n`;
                if (s.user_agent) xml += `        <user_agent>${escapeXml(s.user_agent)}</user_agent>\n`;
                xml += `      </stream>\n`;
              }
            });
            xml += '    </streams>\n';
            xml += '  </channel>\n';
          });
          xml += '</channels>';
          return res.status(200).send(xml);

        case 'txt':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          
          let txt = `IPTV CHANNELS EXPORT\n`;
          txt += `Generated: ${new Date().toISOString()}\n`;
          txt += `Total Channels: ${data.length}\n`;
          txt += `Total Streams: ${data.reduce((sum, ch) => sum + ch.stream_count, 0)}\n\n`;
          txt += '='.repeat(100) + '\n\n';
          
          data.forEach((ch, i) => {
            txt += `[${i + 1}] ${ch.name}${ch.is_blocked ? ' [BLOCKED]' : ''}\n`;
            txt += `${'─'.repeat(100)}\n`;
            txt += `    ID: ${ch.id}\n`;
            if (ch.network) txt += `    Network: ${ch.network}\n`;
            if (ch.country) txt += `    Country: ${ch.country}\n`;
            if (ch.city) txt += `    City: ${ch.city}\n`;
            if (ch.languages.length) txt += `    Languages: ${ch.languages.join(', ')}\n`;
            if (ch.categories.length) txt += `    Categories: ${ch.categories.join(', ')}\n`;
            if (ch.website) txt += `    Website: ${ch.website}\n`;
            if (ch.guide) txt += `    EPG Guide: ${ch.guide.url}\n`;
            txt += `    Streams: ${ch.online_streams}/${ch.stream_count} online\n`;
            if (ch.streams.length) {
              txt += `    \n    Available Streams:\n`;
              ch.streams.forEach((s, idx) => {
                txt += `      ${idx + 1}. [${s.status.toUpperCase()}] ${s.quality} - ${s.url}\n`;
                if (s.http_referrer) txt += `         Referrer: ${s.http_referrer}\n`;
                if (s.user_agent) txt += `         User-Agent: ${s.user_agent}\n`;
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
      total_streams: data.reduce((sum, ch) => sum + ch.stream_count, 0),
      online_streams: data.reduce((sum, ch) => sum + ch.online_streams, 0),
      filters_applied: {
        channel: !!channel,
        language: !!language,
        country: !!country,
        region: !!region,
        subdivision: !!subdivision,
        city: !!city,
        category: !!category,
        network: !!network,
        nsfw: nsfw !== undefined,
        blocked: blocked === "true"
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
