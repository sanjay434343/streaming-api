# Streaming API Documentation

## Base URL

```
https://streaming-api-ruddy.vercel.app/api/streams
```

---

## 1️⃣ Search & Fuzzy Matching

Search across channels with optional fuzzy matching for flexible queries.

| Parameter | Type    | Description                                      | Example                              |
|-----------|---------|--------------------------------------------------|--------------------------------------|
| `search`  | string  | Search across name, alt_names, network           | `?search=bbc`                        |
| `fuzzy`   | boolean | Enable fuzzy matching (1–2 character tolerance)  | `?search=nickelodeon&fuzzy=true`     |
| `channel` | string  | Filter by channel name (partial match)           | `?channel=discovery`                 |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?search=bbc&fuzzy=true&channel=discovery
```

---

## 2️⃣ Geographic Filters

Filter streams by geographic location.

| Parameter     | Type   | Description                    | Example                  |
|---------------|--------|--------------------------------|--------------------------|
| `country`     | string | Filter by country name         | `?country=usa`           |
| `region`      | string | Filter by geographic region    | `?region=europe`         |
| `subdivision` | string | Filter by state/province       | `?subdivision=california`|
| `city`        | string | Filter by city                 | `?city=london`           |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?country=usa&region=europe
```

---

## 3️⃣ Content Filters

Filter by content type, language, and network.

| Parameter  | Type    | Description                          | Example                |
|------------|---------|--------------------------------------|------------------------|
| `category` | string  | Filter by category                   | `?category=news`       |
| `language` | string  | Filter by language                   | `?language=english`    |
| `network`  | string  | Filter by network                    | `?network=cnn`         |
| `nsfw`     | boolean | Filter NSFW content                  | `?nsfw=false`          |
| `blocked`  | boolean | Include blocked channels             | `?blocked=true`        |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?category=news&language=english&nsfw=false
```

---

## 4️⃣ Stream Quality Filters

Filter streams based on technical specifications.

| Parameter       | Type    | Description                                    | Example                    |
|-----------------|---------|------------------------------------------------|----------------------------|
| `quality`       | string  | Filter by quality (comma-separated)            | `?quality=HD,FHD,4K`       |
| `status`        | string  | Filter by stream status (`online`, `offline`)  | `?status=online`           |
| `minBitrate`    | integer | Minimum bitrate in kbps                        | `?minBitrate=2000`         |
| `maxBitrate`    | integer | Maximum bitrate in kbps                        | `?maxBitrate=5000`         |
| `minResolution` | integer | Minimum vertical resolution                    | `?minResolution=1080`      |
| `codec`         | string  | Filter by video codec                          | `?codec=h265`              |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?quality=HD,FHD&status=online&minBitrate=2000
```

---

## 5️⃣ Date Filters

Filter channels by launch date.

| Parameter         | Type | Description                      | Example                         |
|-------------------|------|----------------------------------|---------------------------------|
| `launched_after`  | date | Channels launched after date     | `?launched_after=2020-01-01`    |
| `launched_before` | date | Channels launched before date    | `?launched_before=2023-12-31`   |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?launched_after=2020-01-01&launched_before=2023-12-31
```

---

## 6️⃣ Sorting & Pagination

Control result ordering and pagination.

| Parameter | Type    | Description                                                           | Example          |
|-----------|---------|-----------------------------------------------------------------------|------------------|
| `sort`    | string  | Sort field: name, country, launched, network, popularity, quality     | `?sort=quality`  |
| `order`   | string  | Sort order: asc, desc                                                 | `?order=desc`    |
| `limit`   | integer | Results per page                                                      | `?limit=20`      |
| `offset`  | integer | Skip N results                                                        | `?offset=40`     |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?sort=quality&order=desc&limit=20&offset=40
```

---

## 7️⃣ Response Customization

Customize the response format and included data.

| Parameter         | Type    | Description                                      | Example                           |
|-------------------|---------|--------------------------------------------------|-----------------------------------|
| `fields`          | string  | Return only specific fields (comma-separated)    | `?fields=id,name,streams,logo`    |
| `embed`           | boolean | Embed full feed objects                          | `?embed=true`                     |
| `includeOffline`  | boolean | Include offline streams                          | `?includeOffline=true`            |
| `sortByQuality`   | boolean | Sort streams by quality score                    | `?sortByQuality=true`             |
| `groupByCategory` | boolean | Group results by category (M3U export)           | `?groupByCategory=true`           |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?fields=id,name,streams&embed=true&includeOffline=true
```

---

## 8️⃣ Export Formats

Export results in different formats.

| Parameter | Type   | Description                                    | Example         |
|-----------|--------|------------------------------------------------|-----------------|
| `export`  | string | Export format: json, csv, m3u, m3u8, xml, txt  | `?export=m3u`   |

**Example:**
```
https://streaming-api-ruddy.vercel.app/api/streams?export=m3u
```

---

## 9️⃣ Full Combined Example

Fetch HD/FHD streams of "Discovery" in the USA, English language, online only, sorted by quality, limit 10, and export as JSON:

```
https://streaming-api-ruddy.vercel.app/api/streams?search=discovery&fuzzy=true&country=usa&language=english&quality=HD,FHD&status=online&sort=quality&order=desc&limit=10&offset=0&export=json
```

---

## ✅ Notes & Tips

1. **Combine parameters freely** – Mix and match parameters from different sections to create complex queries.
2. **Fuzzy search** – The `fuzzy=true` parameter only works in conjunction with `search`.
3. **Playlist exports** – When exporting playlists (M3U, M3U8), use `groupByCategory=true` for better organization.
4. **Pagination** – Use `limit` and `offset` with any filter combination for paginated results.
5. **Multiple values** – Comma-separate multiple values for `quality`, `fields`, or `category` parameters.
6. **URL encoding** – Remember to URL-encode special characters in parameter values.

---

## Quick Reference

### Common Query Patterns

**Get all news channels in English:**
```
?category=news&language=english
```

**Get HD channels that are currently online:**
```
?quality=HD&status=online
```

**Search for BBC channels with fuzzy matching:**
```
?search=bbc&fuzzy=true
```

**Export top 50 channels as M3U playlist:**
```
?limit=50&export=m3u&groupByCategory=true
```
