// Lebanese TV — Stremio Add-on
// Run: node index.js
// 
// ** REQUIRES: npm install axios crypto-js stremio-addon-sdk **
//

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require('axios');
const CryptoJS = require('crypto-js');

// --- helper: lightweight fetch (works with commonjs) ---
const fetch = (...args) => import("node-fetch").then(m => m.default(...args));

// --- CONSTANTS from the original player script ---
const EMBED_RESULT_URL = "https://www.elahmad.com/tv/result/embed_result.php"; // This endpoint is assumed based on the original script logic
const SCRAPE_REFERER = "https://www.elahmad.com/";

/**
 * Replicates the AES decryption logic from the original JavaScript player (my_crypt_new).
 * Note: The easybroadcast.io logic is removed as Stremio/addon client handles the final URL.
 */
function decryptStream(encryptedLink, keyHex, ivHex) {
    const e = CryptoJS.enc.Base64.parse(encryptedLink);
    const d = CryptoJS.enc.Hex.parse(keyHex);
    const c = CryptoJS.enc.Hex.parse(ivHex);
    
    // Decrypt using AES, CBC mode, Pkcs7 padding
    const a = CryptoJS.AES.decrypt({ ciphertext: e }, d, {
        iv: c,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    
    let decrypted = a.toString(CryptoJS.enc.Utf8) || '';
    
    // The decrypted string may contain the URL plus a token query at the end. We only need the URL.
    const urlEnd = decrypted.indexOf('?');
    if (urlEnd !== -1) {
        decrypted = decrypted.substring(0, urlEnd);
    }
    
    return decrypted;
}


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
    ...(isElAhmad && { Referer: SCRAPE_REFERER, Origin: "https://elahmad.com" }),
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
    streamID: "lbc", // Changed playerPage/streamKey to a single ID for the POST request
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
    streamID: "aljadeed", // Changed playerPage/streamKey to a single ID for the POST request
    logo: "http://picons.cmshulk.com/picons/207201.png",
  },
];

// --- manifest ---
const manifest = {
    id: "org.joe.lebanese.tv",
    version: "1.2.0", // Bumped version
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

// --- catalog handler (no change) ---
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

// --- meta handler (no change) ---
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

// --- stream handler (Decryption Heist Logic) ---
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv") return { streams: [] };
  const ch = CHANNELS.find((c) => c.id === id);
  if (!ch) return { streams: [] };

  let masterPlaylistUrl;

  // These are the headers we need to pretend to be a browser
  const streamHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    Referer: SCRAPE_REFERER,
    Origin: "https://elahmad.com",
  };

  // --- DECRYPTION HEIST LOGIC ---
  if (ch.streamID) {
    // Step 1: Request the encrypted link, key, and IV from the API endpoint
    console.log(`Requesting encrypted payload for stream ID: ${ch.streamID}`);
    try {
        // We MUST use the id/streamKey from the URL, which is handled by streamID
        const response = await axios.post(
            EMBED_RESULT_URL, 
            `id=${encodeURIComponent(ch.streamID)}`, 
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    ...streamHeaders // Send headers with the POST request
                }
            }
        );

        const data = response.data;

        if (data.error) {
          throw new Error(`API Error: ${data.error}`);
        }

        if (data.link_4 && data.key && data.iv) {
          // Step 2: Decrypt the link
          masterPlaylistUrl = decryptStream(data.link_4, data.key, data.iv);
          console.log(`FUCK YEAH. Decrypted fresh link: ${masterPlaylistUrl}`);
        } else {
          throw new Error("Missing required decryption components (link_4, key, or iv)");
        }

    } catch (err) {
      console.error(`Goddammit, decryption failed for ${ch.name}:`, err.message);
      return { streams: [] }; // Give up, we failed
    }
  } else {
    // This is a direct link (like MTV), no decryption needed
    masterPlaylistUrl = ch.url;
  }
  // --- END OF DECRYPTION HEIST LOGIC ---

  if (!masterPlaylistUrl) {
    console.error(`Shit, no masterPlaylistUrl for ${ch.name}. Bailing.`);
    return { streams: [] };
  }

  // Now we feed our decrypted (or direct) link to your smart playlist parser
  const freshUrl = await fetchFreshPlaylist(masterPlaylistUrl);

  // Check if the fresh URL is from elahmad to add proxy headers
  const isElAhmad = /elahmad\.(xyz|com)/i.test(freshUrl);
  
  // Define the final headers for Stremio to proxy
  const proxyHeaders = {
    "User-Agent": streamHeaders["User-Agent"],
  };
  
  if (isElAhmad) {
    proxyHeaders.Referer = streamHeaders.Referer;
  }

  return {
    streams: [
      {
        url: freshUrl,
        title: ch.name + " (auto-fresh)",
        // proxyHeaders is CORRECT. This tells Stremio's server to use these headers
        proxyHeaders: proxyHeaders,
        behaviorHints: { notWebReady: false },
      },
    ],
  };
});

// --- start server (Render-friendly) ---
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese TV add-on running at: http://127.0.0.1:7000/manifest.json");