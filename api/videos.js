/* ============================================================
   /api/videos — live video list + view counts for MAAR's channels.

   Two modes, chosen automatically:

   1. FULL (recommended): set YOUTUBE_API_KEY in Vercel →
      Project Settings → Environment Variables. Returns EVERY public
      upload with exact view counts, duration and channel stats.

   2. FALLBACK (no key needed): reads each channel's public RSS feed.
      Returns the latest ~15 uploads per channel with view counts.
      The response says `mode: "rss"` so the site can label it.

   Responses are cached at Vercel's edge for 30 minutes and served
   stale while refreshing, so new uploads and changing view counts
   show up automatically all day without burning API quota.
   ============================================================ */

const CHANNELS = [
  { id: 'nashid', handle: 'MAAR-NASHID', name: 'MAAR NASHID' },
  { id: 'gojol',  handle: 'MAARGOJOL',   name: 'MAAR GOJOL' },
];

const KEY = process.env.YOUTUBE_API_KEY || '';
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_PAGES = 12; // 12 x 50 = up to 600 videos per channel

/* ---------- helpers ---------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('YouTube API ' + r.status);
  return r.json();
}

function isoToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function pickThumb(t) {
  if (!t) return '';
  return (t.maxres || t.standard || t.high || t.medium || t.default || {}).url || '';
}

const decode = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

/* ---------- FULL mode (YouTube Data API) ---------- */
async function loadViaApi(ch) {
  const c = await getJSON(
    `${API}/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent('@' + ch.handle)}&key=${KEY}`
  );
  const item = c.items && c.items[0];
  if (!item) throw new Error('Channel not found: ' + ch.handle);

  const uploads = item.contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let pageToken = '';
  for (let i = 0; i < MAX_PAGES; i++) {
    const p = await getJSON(
      `${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}` +
      (pageToken ? `&pageToken=${pageToken}` : '') + `&key=${KEY}`
    );
    (p.items || []).forEach((x) => ids.push(x.contentDetails.videoId));
    pageToken = p.nextPageToken;
    if (!pageToken) break;
  }

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(',');
    const v = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${batch}&key=${KEY}`);
    (v.items || []).forEach((x) => {
      videos.push({
        id: x.id,
        channel: ch.id,
        title: x.snippet.title,
        publishedAt: x.snippet.publishedAt,
        views: x.statistics && x.statistics.viewCount != null ? +x.statistics.viewCount : null,
        duration: isoToSeconds(x.contentDetails && x.contentDetails.duration),
        thumb: pickThumb(x.snippet.thumbnails),
      });
    });
  }

  const s = item.statistics || {};
  return {
    channel: {
      id: ch.id,
      name: item.snippet.title || ch.name,
      handle: ch.handle,
      url: `https://www.youtube.com/@${ch.handle}`,
      avatar: pickThumb(item.snippet.thumbnails),
      subscribers: s.hiddenSubscriberCount ? null : +s.subscriberCount || 0,
      videoCount: +s.videoCount || videos.length,
      views: +s.viewCount || null,
    },
    videos,
  };
}

/* ---------- FALLBACK mode (public RSS feed) ---------- */
async function loadViaRss(ch) {
  const page = await fetch(`https://www.youtube.com/@${ch.handle}`, {
    headers: { 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
  }).then((r) => r.text());
  const m =
    /"channelId":"(UC[\w-]{22})"/.exec(page) ||
    /channel\/(UC[\w-]{22})/.exec(page) ||
    /"externalId":"(UC[\w-]{22})"/.exec(page);
  if (!m) throw new Error('Could not resolve channel id for ' + ch.handle);

  const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`).then((r) => {
    if (!r.ok) throw new Error('RSS ' + r.status);
    return r.text();
  });

  const videos = [];
  const entries = xml.split('<entry>').slice(1);
  entries.forEach((e) => {
    const id = (/<yt:videoId>([^<]+)</.exec(e) || [])[1];
    if (!id) return;
    videos.push({
      id,
      channel: ch.id,
      title: decode((/<title>([^<]*)</.exec(e) || [])[1]),
      publishedAt: (/<published>([^<]+)</.exec(e) || [])[1],
      views: +((/<media:statistics views="(\d+)"/.exec(e) || [])[1] || 0),
      duration: null,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  });

  const name = decode((/<author>\s*<name>([^<]+)</.exec(xml) || [])[1]) || ch.name;
  return {
    channel: {
      id: ch.id, name, handle: ch.handle,
      url: `https://www.youtube.com/@${ch.handle}`,
      avatar: '', subscribers: null, videoCount: videos.length, views: null,
    },
    videos,
  };
}

/* ---------- handler ---------- */
module.exports = async (req, res) => {
  const mode = KEY ? 'api' : 'rss';
  const settled = await Promise.allSettled(
    CHANNELS.map((ch) => (KEY ? loadViaApi(ch) : loadViaRss(ch)))
  );

  const channels = [];
  const videos = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      channels.push(r.value.channel);
      videos.push(...r.value.videos);
    } else {
      errors.push({ channel: CHANNELS[i].handle, message: String(r.reason && r.reason.message || r.reason) });
    }
  });

  if (!channels.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not reach YouTube', errors });
  }

  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
  res.status(200).json({ updatedAt: new Date().toISOString(), mode, channels, videos, errors });
};
