// Lebanese TV — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- helper: lightweight fetch (works with commonjs) ---
const fetch = (...args) => import("node-fetch").then(m => m.default(...args));

/**
 * Try to return a fresh, mobile-friendly (.m3u8) URL.
 * - If the input is a sub-playlist, we probe parent "index.m3u8" or "master.m3u8"
 * - Prefer H.264/AAC variants (avc1 + mp4a) for phones
 * - Send desktop UA + Referer/Origin for elahmad hosts
 */
async function fetchFreshPlaylist(seedUrl) {
  const isElAhmad = /elahmad\.(xyz|com)/i.test(seedUrl);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ...(isElAhmad && { Referer: "https://elahmad.com/", Origin: "https://elahmad.com" }),
  };

  // Try a URL and, if it looks like a master playlist, pick an H.264 variant
  const tryPlaylist = async (url) => {
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const text = await r.text();

    // If it already contains variants, pick H.264 if present
    const lines = text.split(/\r?\n/);
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
        const next = lines[i + 1];
        if (next && /\.m3u8(\?|$)/i.test(next)) {
          const abs = new URL(next, url).toString();
          const isH264 = /CODECS="[^"]*avc1[^"]*mp4a\.40\.2/i.test(lines[i]);
          if (isH264) return abs; // take H.264 immediately
          if (!best) best = abs;  // remember first variant as fallback
        }
      }
    }

    // If no variants, maybe it's already a variant playlist; just return it
    if (!best && /\.m3u8(\?|$)/i.test(url)) return url;
    return best || url;
  };

  // 1) Try seed as-is
  let chosen = await tryPlaylist(seedUrl);
  if (chosen) return chosen;

  // 2) Probe parent "index.m3u8" and "master.m3u8"
  const base = new URL("./", seedUrl).toString();
  for (const cand of ["index.m3u8", "master.m3u8"]) {
    const url = new URL(cand, base).toString();
    chosen = await tryPlaylist(url);
    if (chosen) return chosen;
  }

  // 3) Fallback to seed
  return seedUrl;
}

// --- your channels ---
const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    url: "https://games1.elahmad.xyz/tv764_www.elahmad.com_lbc/tracks-v1a1/mono.m3u8?token=766dc34755a4638d6c710ae5715390340bdbe9a2-224fced2d510148838fc9e3c2b6b7acb-1762877321-1762866521",
    logo: "http://picons.cmshulk.com/picons/151656.png",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "https://shls-live-enc.edgenextcdn.net/out/v1/45ad6fbe1f7149ad9f05f8aefc38f6c0/index_8.m3u8",
    logo: "http://picons.cmshulk.com/picons/151658.png",
  },
  {
    id: "iptv_aljadeed_lebanon",
    name: "Al Jadeed",
    url: "https://games1.elahmad.xyz/tv764_www.elahmad.com_aljadeed/tracks-v1a1/mono.m3u8?token=7304c9345b635e496122812d34f1a9939a419755-0cfc93ffd0c4549f290cf1bb0837195d-1762877039-1762866239",
    logo: "http://picons.cmshulk.com/picons/207201.png",
  },
];

// --- manifest ---
const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.1.0",
  name: "Lebanese TV",
  description: "Live Lebanese channels (LBCI, MTV Lebanon, Al Jadeed).",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "lebanese_tv_catalog",
      name: "Lebanese TV",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  idPrefixes: ["iptv_"],
};

const builder = new addonBuilder(manifest);

// --- catalog handler ---
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== "tv" || id !== "lebanese_tv_catalog") return Promise.resolve({ metas: [] });
  const q = (extra?.search || "").toLowerCase();
  const metas = CHANNELS
    .filter((ch) => !q || ch.name.toLowerCase().includes(q) || ch.id.toLowerCase().includes(q))
    .map((ch) => ({
      id: ch.id,
      type: "tv",
      name: ch.name,
      poster: ch.logo,
      posterShape: "landscape",
      description: `${ch.name} live stream`,
    }));

  return Promise.resolve({ metas });
});

// --- meta handler ---
builder.defineMetaHandler(({ type, id }) => {
  if (type !== "tv") return Promise.resolve({ meta: {} });
  const ch = CHANNELS.find((c) => c.id === id);
  if (!ch) return Promise.resolve({ meta: {} });

  return Promise.resolve({
    meta: {
      id: ch.id,
      type: "tv",
      name: ch.name,
      poster: ch.logo,
      background: ch.logo,
      description: `${ch.name} live broadcast.`,
    },
  });
});

// --- stream handler (auto-fresh + mobile-safe headers) ---
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv") return { streams: [] };
  const ch = CHANNELS.find((c) => c.id === id);
  if (!ch) return { streams: [] };

  const freshUrl = await fetchFreshPlaylist(ch.url);

  // Default desktop-like headers; add Referer/Origin for elahmad hosts
  const isElAhmad = /elahmad\.(xyz|com)/i.test(freshUrl);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ...(isElAhmad && { Referer: "https://elahmad.com/", Origin: "https://elahmad.com" }),
  };

  return {
    streams: [
      {
        url: freshUrl,
        title: ch.name + " (auto-fresh)",
        proxyHeaders: headers, // lets Stremio fetch server-side over HTTPS with these headers
        behaviorHints: { notWebReady: false },
      },
    ],
  };
});

// --- start server (Render-friendly) ---
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese TV add-on running at: http://127.0.0.1:7000/manifest.json");
