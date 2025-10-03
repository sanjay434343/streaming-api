// File: pages/api/channel-streams.js

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cache = null;
let cacheTimestamp = 0;

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
    order = "asc"
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
