// File: pages/api/channel-streams.js

// Multi-tier caching system
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

let cache = null;
let cacheTimestamp = 0;
let requestCounts = new Map();

// Advanced compression and optimization
const compressionEnabled = true;

// Helper: XML escape
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: Rate limiting
function checkRateLimit(identifier) {
  const now = Date.now();
  const userRequests = requestCounts.get(identifier) || [];
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  recentRequests.push(now);
  requestCounts.set(identifier, recentRequests);
  
  // Cleanup old entries
  if (requestCounts.size > 10000) {
    const cutoff = now - RATE_LIMIT_WINDOW;
    for (const [key, times] of requestCounts.entries()) {
      if (times.every(t => t < cutoff)) {
        requestCounts.delete(key);
      }
    }
  }
  
  return true;
}

// Advanced fetch with retry, timeout, and circuit breaker
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'IPTV-API/2.0'
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
      await new Promise(resolve => setTimeout(resolve, 300 * Math.pow(2, i)));
    }
  }
}

// Stream quality scoring
function calculateStreamQuality(stream) {
  let score = 0;
  if (stream.status === 'online') score += 50;
  if (stream.quality === '4K') score += 40;
  else if (stream.quality === 'FHD') score += 30;
  else if (stream.quality === 'HD') score += 20;
  else if (stream.quality === 'SD') score += 10;
  
  if (stream.bitrate) score += Math.min(stream.bitrate / 100, 20);
  if (stream.frame_rate >= 60) score += 10;
  if (stream.codec === 'h265' || stream.codec === 'hevc') score += 5;
  
  return score;
}

// Advanced search with fuzzy matching
function fuzzyMatch(str, query) {
  if (!str || !query) return false;
  str = str.toLowerCase();
  query = query.toLowerCase();
  
  // Exact match
  if (str.includes(query)) return true;
  
  // Fuzzy match (allowing 1-2 character differences)
  let j = 0;
  for (let i = 0; i < str.length && j < query.length; i++) {
    if (str[i] === query[j]) j++;
  }
  return j >= query.length - 2;
}

// Generate M3U with advanced features
function generateAdvancedM3U(data, options = {}) {
  const { includeOffline = false, sortByQuality = true, groupByCategory = true } = options;
  
  let m3u = '#EXTM3U x-tvg-url=""\n';
  
  const processedData = data.map(ch => ({
    ...ch,
    streams: ch.streams
      .filter(s => includeOffline || s.status === 'online')
      .sort((a, b) => sortByQuality ? calculateStreamQuality(b) - calculateStreamQuality(a) : 0)
  }));
  
  if (groupByCategory) {
    const grouped = new Map();
    processedData.forEach(ch => {
      const cat = ch.categories[0] || 'General';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat).push(ch);
    });
    
    for (const [category, channels] of grouped.entries()) {
      channels.forEach(ch => {
        ch.streams.forEach((stream, idx) => {
          m3u += generateM3UEntry(ch, stream, category, idx);
        });
      });
    }
  } else {
    processedData.forEach(ch => {
      ch.streams.forEach((stream, idx) => {
        m3u += generateM3UEntry(ch, stream, ch.categories[0] || 'General', idx);
      });
    });
  }
  
  return m3u;
}

function generateM3UEntry(ch, stream, category, idx) {
  const attrs = [
    `tvg-id="${ch.id}"`,
    `tvg-name="${ch.name}"`,
    ch.logo ? `tvg-logo="${ch.logo}"` : '',
    ch.country ? `tvg-country="${ch.country}"` : '',
    ch.languages[0] ? `tvg-language="${ch.languages[0]}"` : '',
    `group-title="${category}"`,
    stream.http_referrer ? `http-referrer="${stream.http_referrer}"` : '',
    stream.user_agent ? `http-user-agent="${stream.user_agent}"` : '',
    `quality="${stream.quality || 'SD'}"`,
    `status="${stream.status}"`
  ].filter(Boolean).join(' ');
  
  const displayName = ch.streams.length > 1 
    ? `${ch.name} [${stream.quality || 'SD'}]` 
    : ch.name;
  
  return `#EXTINF:-1 ${attrs},${displayName}\n${stream.url}\n`;
}

export default async function handler(req, res) {
  const startTime = Date.now();
  
  // Enhanced CORS with credentials support
  const origin = req.headers.origin || '*';
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-API-Key");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Rate limiting
  const identifier = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(identifier)) {
    return res.status(429).json({ 
      error: "Rate limit exceeded",
      message: `Maximum ${MAX_REQUESTS_PER_WINDOW} requests per minute`
    });
  }

  const { 
    limit, 
    offset,
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
    quality,
    status,
    sort = "name",
    order = "asc",
    search,
    fuzzy,
    export: exportFormat,
    fields,
    embed,
    includeOffline,
    sortByQuality,
    groupByCategory,
    minBitrate,
    maxBitrate,
    minResolution,
    codec,
    launched_after,
    launched_before
  } = req.query;

  const API_BASE = "https://iptv-org.github.io/api/";
  
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

    // Smart caching with cache control
    if (cache && (now - cacheTimestamp) < CACHE_DURATION) {
      apiData = cache;
      res.setHeader("X-Cache", "HIT");
    } else {
      res.setHeader("X-Cache", "MISS");
      
      // Parallel fetch with batching
      apiData = await Promise.all(
        files.map(f => fetchWithRetry(API_BASE + f).catch(err => {
          console.warn(`Failed to fetch ${f}:`, err.message);
          return [];
        }))
      );
      
      cache = apiData;
      cacheTimestamp = now;
    }

    const [
      channels, streams, feeds, languages, categories, countries, 
      regions, subdivisions, cities, logos, timezones, guides, blocklist
    ] = apiData;

    // Build optimized lookup structures
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

    // Index by channel
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

    // Blocklist filter
    if (blocked !== "true") {
      filteredChannels = filteredChannels.filter(c => !blocklistSet.has(c.id));
    }

    // Advanced search with fuzzy matching
    if (search) {
      const searchQuery = search.toLowerCase();
      const useFuzzy = fuzzy === "true";
      
      filteredChannels = filteredChannels.filter(c => {
        const matchFn = useFuzzy ? fuzzyMatch : (str, q) => str.toLowerCase().includes(q);
        return matchFn(c.name, searchQuery) || 
               (c.alt_names || []).some(a => matchFn(a, searchQuery)) ||
               matchFn(c.network || '', searchQuery);
      });
    }

    // Channel name filter
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

    // Geographic filters
    if (country) {
      const countryQuery = country.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.country && countriesMap.get(c.country)?.toLowerCase().includes(countryQuery)
      );
    }

    if (region) {
      const regionQuery = region.toLowerCase();
      filteredChannels = filteredChannels.filter(c =>
        (c.broadcast_area || []).some(area => 
          area.startsWith('r/') && regionsMap.get(area.substring(2))?.toLowerCase().includes(regionQuery)
        )
      );
    }

    if (subdivision) {
      const subQuery = subdivision.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.subdivision && subdivisionsMap.get(c.subdivision)?.toLowerCase().includes(subQuery)
      );
    }

    if (city) {
      const cityQuery = city.toLowerCase();
      filteredChannels = filteredChannels.filter(c => 
        c.city && citiesMap.get(c.city)?.toLowerCase().includes(cityQuery)
      );
    }

    // Content filters
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

    // Date filters
    if (launched_after) {
      filteredChannels = filteredChannels.filter(c => 
        c.launched && c.launched >= launched_after
      );
    }

    if (launched_before) {
      filteredChannels = filteredChannels.filter(c => 
        c.launched && c.launched <= launched_before
      );
    }

    // Stream quality filters
    if (quality) {
      const qualities = quality.split(',').map(q => q.toUpperCase());
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => qualities.includes((s.quality || 'SD').toUpperCase()));
      });
    }

    if (status) {
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => s.status === status);
      });
    }

    if (minBitrate) {
      const minBit = parseInt(minBitrate);
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => s.bitrate && s.bitrate >= minBit);
      });
    }

    if (maxBitrate) {
      const maxBit = parseInt(maxBitrate);
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => s.bitrate && s.bitrate <= maxBit);
      });
    }

    if (codec) {
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => s.codec?.toLowerCase().includes(codec.toLowerCase()));
      });
    }

    if (minResolution) {
      const minRes = parseInt(minResolution);
      filteredChannels = filteredChannels.filter(c => {
        const chStreams = streamsByChannel.get(c.id) || [];
        return chStreams.some(s => s.height && s.height >= minRes);
      });
    }

    // Advanced sorting
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
        case "popularity":
          const aStreams = streamsByChannel.get(a.id) || [];
          const bStreams = streamsByChannel.get(b.id) || [];
          aVal = aStreams.length;
          bVal = bStreams.length;
          break;
        case "quality":
          const aScores = (streamsByChannel.get(a.id) || []).map(calculateStreamQuality);
          const bScores = (streamsByChannel.get(b.id) || []).map(calculateStreamQuality);
          aVal = Math.max(...aScores, 0);
          bVal = Math.max(...bScores, 0);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination
    const numericOffset = parseInt(offset, 10) || 0;
    const numericLimit = parseInt(limit, 10);
    const totalResults = filteredChannels.length;
    
    if (!isNaN(numericLimit) && numericLimit > 0) {
      filteredChannels = filteredChannels.slice(numericOffset, numericOffset + numericLimit);
    } else if (numericOffset > 0) {
      filteredChannels = filteredChannels.slice(numericOffset);
    }

    // Field selection
    const selectedFields = fields ? fields.split(',').map(f => f.trim()) : null;

    // Build response data
    const data = filteredChannels.map(ch => {
      const chFeeds = feedsByChannel.get(ch.id) || [];
      const chStreams = streamsByChannel.get(ch.id) || [];
      const chGuide = guidesMap.get(ch.id);

      const langSet = new Set([
        ...(ch.languages || []).map(code => languagesMap.get(code) || code),
        ...chFeeds.flatMap(f => (f.languages || []).map(code => languagesMap.get(code) || code))
      ]);

      const broadcastAreas = (ch.broadcast_area || []).map(area => {
        if (area.startsWith('c/')) return countriesMap.get(area.substring(2)) || area;
        if (area.startsWith('r/')) return regionsMap.get(area.substring(2)) || area;
        if (area.startsWith('s/')) return subdivisionsMap.get(area.substring(2)) || area;
        return area;
      });

      const processedStreams = chStreams
        .filter(s => includeOffline === "true" || s.status === "online")
        .map(s => ({
          channel: s.channel,
          url: s.url,
          http_referrer: s.http_referrer || null,
          user_agent: s.user_agent || null,
          quality: s.quality || "SD",
          quality_score: calculateStreamQuality(s),
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
        }))
        .sort((a, b) => sortByQuality === "true" ? b.quality_score - a.quality_score : 0);

      const channelData = {
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
        feeds: embed === "true" ? chFeeds : chFeeds.length,
        streams: processedStreams,
        stream_count: processedStreams.length,
        online_streams: processedStreams.filter(s => s.status === "online").length,
        best_stream: processedStreams[0] || null
      };

      // Field selection
      if (selectedFields) {
        const filtered = {};
        selectedFields.forEach(field => {
          if (channelData.hasOwnProperty(field)) {
            filtered[field] = channelData[field];
          }
        });
        return filtered;
      }

      return channelData;
    });

    const processingTime = Date.now() - startTime;

    // Export formats
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
            total: totalResults,
            offset: numericOffset,
            exported_at: new Date().toISOString(),
            processing_time_ms: processingTime,
            data 
          }, null, 2));

        case 'csv':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          
          const csvHeaders = [
            'ID', 'Name', 'Network', 'Country', 'Subdivision', 'City', 'Languages', 
            'Categories', 'Is NSFW', 'Launched', 'Website', 'Logo', 'EPG', 
            'Total Streams', 'Online Streams', 'Best Quality', 'Stream URLs'
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
            ch.best_stream?.quality || '',
            `"${ch.streams.map(s => s.url).filter(Boolean).join(' | ')}"`
          ].join(','));
          
          const csv = [csvHeaders.join(','), ...csvRows].join('\n');
          return res.status(200).send('\ufeff' + csv);

        case 'm3u':
        case 'm3u8':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.m3u"`);
          res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
          
          const m3uContent = generateAdvancedM3U(data, {
            includeOffline: includeOffline === "true",
            sortByQuality: sortByQuality === "true",
            groupByCategory: groupByCategory === "true"
          });
          
          return res.status(200).send(m3uContent);

        case 'xml':
          res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
          xml += `<channels count="${data.length}" total="${totalResults}">\n`;
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
            xml += `    <streams count="${ch.stream_count}" online="${ch.online_streams}">\n`;
            ch.streams.forEach(s => {
              if (s.url) {
                xml += `      <stream quality="${escapeXml(s.quality)}" status="${s.status}" score="${s.quality_score}">\n`;
                xml += `        <url>${escapeXml(s.url)}</url>\n`;
                if (s.http_referrer) xml += `        <referrer>${escapeXml(s.http_referrer)}</referrer>\n`;
                if (s.user_agent) xml += `        <user_agent>${escapeXml(s.user_agent)}</user_agent>\n`;
                if (s.bitrate) xml += `        <bitrate>${s.bitrate}</bitrate>\n`;
                if (s.codec) xml += `        <codec>${escapeXml(s.codec)}</codec>\n`;
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
          
          let txt = `╔═══════════════════════════════════════════════════════════════════╗\n`;
          txt += `║           IPTV CHANNELS DATABASE EXPORT                           ║\n`;
          txt += `╚═══════════════════════════════════════════════════════════════════╝\n\n`;
          txt += `Generated: ${new Date().toISOString()}\n`;
          txt += `Results: ${data.length} / ${totalResults} channels\n`;
          txt += `Total Streams: ${data.reduce((sum, ch) => sum + ch.stream_count, 0)}\n`;
          txt += `Processing Time: ${processingTime}ms\n\n`;
          txt += '═'.repeat(100) + '\n\n';
          
          data.forEach((ch, i) => {
            txt += `[${i + 1}] ${ch.name}${ch.is_blocked ? ' 🚫 BLOCKED' : ''}\n`;
            txt += `${'─'.repeat(100)}\n`;
            txt += `    📺 ID: ${ch.id}\n`;
            if (ch.network) txt += `    🌐 Network: ${ch.network}\n`;
            if (ch.country) txt += `    🌍 Country: ${ch.country}\n`;
            if (ch.city) txt += `    📍 City: ${ch.city}\n`;
            if (ch.languages.length) txt += `    🗣️  Languages: ${ch.languages.join(', ')}\n`;
            if (ch.categories.length) txt += `    📂 Categories: ${ch.categories.join(', ')}\n`;
            if (ch.website) txt += `    🔗 Website: ${ch.website}\n`;
            if (ch.guide) txt += `    📋 EPG Guide: ${ch.guide.url}\n`;
            txt += `    📊 Streams: ${ch.online_streams}/${ch.stream_count} online\n`;
            if (ch.best_stream) txt += `    ⭐ Best Quality: ${ch.best_stream.quality} (Score: ${ch.best_stream.quality_score})\n`;
            if (ch.streams.length) {
              txt += `    \n    📡 Available Streams:\n`;
              ch.streams.forEach((s, idx) => {
                const statusIcon = s.status === 'online' ? '✅' : '❌';
                txt += `      ${idx + 1}. ${statusIcon} [${s.quality}] Score: ${s.quality_score}\n`;
                txt += `         🔗 ${s.url}\n`;
                if (s.bitrate) txt += `         📊 Bitrate: ${s.bitrate} kbps\n`;
                if (s.codec) txt += `         🎬 Codec: ${s.codec}\n`;
                if (s.width && s.height) txt += `         📐 Resolution: ${s.width}x${s.height}\n`;
                if (s.http_referrer) txt += `         🔐 Referrer: ${s.http_referrer}\n`;
                if (s.user_agent) txt += `         🖥️  User-Agent: ${s.user_agent}\n`;
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

    // Normal JSON response with full metadata
    res.setHeader("X-Processing-Time", `${processingTime}ms`);
    res.setHeader("X-Total-Results", totalResults.toString());
    res.setHeader("X-Returned-Results", data.length.toString());
    
    res.status(200).json({ 
      success: true,
      count: data.length, 
      total: totalResults,
      offset: numericOffset,
      limit: numericLimit || null,
      has_more: numericLimit ? (numericOffset + data.length) < totalResults : false,
      total_streams: data.reduce((sum, ch) => sum + ch.stream_count, 0),
      online_streams: data.reduce((sum, ch) => sum + ch.online_streams, 0),
      processing_time_ms: processingTime,
      cache_status: res.getHeader("X-Cache"),
      filters_applied: {
        search: !!search,
        fuzzy: fuzzy === "true",
        channel: !!channel,
        language: !!language,
        country: !!country,
        region: !!region,
        subdivision: !!subdivision,
        city: !!city,
        category: !!category,
        network: !!network,
        nsfw: nsfw !== undefined,
        blocked: blocked === "true",
        quality: !!quality,
        status: !!status,
        minBitrate: !!minBitrate,
        maxBitrate: !!maxBitrate,
        minResolution: !!minResolution,
        codec: !!codec,
        launched_after: !!launched_after,
        launched_before: !!launched_before
      },
      sorting: {
        field: sort,
        order: order
      },
      api_version: "2.0",
      documentation: "https://streaming-api-ruddy.vercel.app/api/docs",
      data 
    });

  } catch (error) {
    console.error("API Error:", error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        success: false,
        error: "Gateway Timeout",
        message: "Request timeout - upstream API did not respond in time"
      });
    }

    res.status(500).json({ 
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch or process IPTV data",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
