// Lebanese TV — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- helper: lightweight fetch (works with commonjs) ---
const fetch = (...args) => import("node-fetch").then(m => m.default(...args));

/**
Panel generation and content logic for the Stremio add-on
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
          if (!best) best = abs;  // remember first variant as fallback
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
    playerPage: "https://www.elahmad.com/tv/watchtv.php?id=lbc", // We scrape this page
    streamKey: "tv764_www.elahmad.com_lbc", // To find a link containing this
    logo: "http://picons.cmshulk.com/picons/151656.png",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "https://shls-live-enc.edgenextcdn.net/out/v1/45ad6fbe1f7149ad9f05f8aefc38f6c0/index_8.m3u8", // This one is direct, no scraping needed
    logo: "http://picons.cmshulk.com/picons/151658.png",
  },
  {
    id: "iptv_aljadeed_lebanon",
    name: "Al Jadeed",
    playerPage: "https://elahmad.com/", // We scrape this page
    streamKey: "tv764_www.elahmad.com_aljadeed", // To find a link containing this
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

  let masterPlaylistUrl;

  // These are the headers we need to pretend to be a browser
  const scrapeHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    Referer: "https://elahmad.com/",
    Origin: "https://elahmad.com",
  };

  // --- THIS IS THE NEW HEIST LOGIC ---
  if (ch.streamKey) {
    // This is an elahmad channel, we must scrape
    console.log(`Scraping ${ch.playerPage} for stream key: ${ch.streamKey}`);
    try {
      const pageRes = await fetch(ch.playerPage, { headers: scrapeHeaders });
      if (!pageRes.ok) throw new Error(`Scraper failed to fetch page: ${pageRes.status}`);

      const pageText = await pageRes.text();

      // This regex is our lockpick. It looks for the full m3u8 link containing the streamKey
// This regex is our lockpick. It looks for the full m3u8 link containing the streamKey
      const regex = new RegExp(
        '(https?:\\/\\/games\\d+\\.elahmad\\.xyz\\/' + ch.streamKey + '\\/[^\\\'"\\s]+\\.m3u8\\?token=[a-f0-9\\-]+)',
        "i",
      );
      const match = pageText.match(regex);

      if (match && match[1]) {
        masterPlaylistUrl = match[1];
        console.log(`FUCK YEAH. Found fresh link: ${masterPlaylistUrl}`);
      } else {
        throw new Error(`Could not find stream link in page source for ${ch.name}`);
      }
    } catch (err) {
      console.error(`Goddammit, scraping failed for ${ch.name}:`, err.message);
      return { streams: [] }; // Give up, we failed
    }
  } else {
    // This is a direct link (like MTV), no scraping needed
    masterPlaylistUrl = ch.url;
  }
  // --- END OF HEIST LOGIC ---

  if (!masterPlaylistUrl) {
    console.error(`Shit, no masterPlaylistUrl for ${ch.name}. Bailing.`);
    return { streams: [] };
  }

  // Now we feed our stolen (or direct) link to your smart playlist parser
  const freshUrl = await fetchFreshPlaylist(masterPlaylistUrl);

  // Check if the fresh URL is from elahmad to add proxy headers
  const isElAhmad = /elahmad\.(xyz|com)/i.test(freshUrl);
  const streamHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ...(isElAhmad && { Referer: "https://elahmad.com/", Origin: "https://elahmad.com" }),
  };

  return {
    streams: [
      {
        url: freshUrl,
        title: ch.name + " (auto-fresh)",
        // proxyHeaders is CORRECT. This tells Stremio's server to use these headers
        // when *it* fetches the playlist, which is exactly what elahmad wants.
        proxyHeaders: { "User-Agent": streamHeaders["User-Agent"], "Referer": streamHeaders["Referer"] },
        behaviorHints: { notWebReady: false },
      },
    ],
  };
});

// --- start server (Render-friendly) ---
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese TV add-on running at: http://127.0.0.1:7000/manifest.json");