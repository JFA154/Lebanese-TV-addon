// Lebanese TV — Stremio Add-on
// Run: node index.js
// 
// ** REQUIRES: npm install axios crypto-js stremio-addon-sdk **
//

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require('axios');
const CryptoJS = require('crypto-js');

// --- CONSTANTS ---
const SCRAPE_REFERER = "https://www.elahmad.com/";
const EMBED_RESULT_URL = "https://www.elahmad.com/tv/result/embed_result.php";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const ORIGIN = "https://elahmad.com";

// --- HELPERS ---

// Lightweight fetch for commonjs (used in fetchFreshPlaylist)
const fetch = (...args) => import("node-fetch").then(m => m.default(...args));

/**
 * Replicates the AES decryption logic (my_crypt_new).
 * @param {string} encryptedLink Base64 encrypted stream link.
 * @param {string} keyHex AES key in Hex.
 * @param {string} ivHex AES IV in Hex.
 * @returns {string} The decrypted, clean stream URL.
 */
function decryptStream(encryptedLink, keyHex, ivHex) {
    const e = CryptoJS.enc.Base64.parse(encryptedLink);
    const d = CryptoJS.enc.Hex.parse(keyHex);
    const c = CryptoJS.enc.Hex.parse(ivHex);
    
    const a = CryptoJS.AES.decrypt({ ciphertext: e }, d, {
        iv: c,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    
    let decrypted = a.toString(CryptoJS.enc.Utf8) || '';
    
    // The decrypted string may contain the URL plus a token query at the end. We only need the URL.
    const urlEnd = decrypted.indexOf('?');
    if (urlEnd !== -1) {
        // We keep the query here because it's part of the necessary stream link
        decrypted = decrypted.substring(0, urlEnd);
    }
    
    return decrypted;
}

/**
 * Probes the stream URL to find the H.264/AAC variant for better mobile/device compatibility.
 * @param {string} seedUrl The master m3u8 playlist URL.
 * @returns {Promise<string>} The best variant URL or the original URL.
 */
async function fetchFreshPlaylist(seedUrl) {
    const isElAhmad = /elahmad\.(xyz|com)/i.test(seedUrl);
    const headers = {
        "User-Agent": USER_AGENT,
        ...(isElAhmad && { Referer: SCRAPE_REFERER, Origin: ORIGIN }),
    };

    const tryPlaylist = async (url) => {
        const r = await fetch(url, { headers });
        if (!r.ok) return null;
        const text = await r.text();

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
        if (!best && /\.m3u8(\?|$)/i.test(url)) return url;
        return best || url;
    };

    let chosen = await tryPlaylist(seedUrl);
    if (chosen) return chosen;

    const base = new URL("./", seedUrl).toString();
    for (const cand of ["index.m3u8", "master.m3u8"]) {
        const url = new URL(cand, base).toString();
        chosen = await tryPlaylist(url);
        if (chosen) return chosen;
    }

    return seedUrl;
}

// --- CHANNELS (Using streamID for elahmad channels) ---
const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    streamID: "lbc", 
  	logo: "http://picons.cmshulk.com/picons/151656.png",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "https://shls-live-enc.edgenextcdn.net/out/v1/45ad6fbe1f7149ad9f05f8aefc38f6c0/index_8.m3u8", // Direct link
  	logo: "http://picons.cmshulk.com/picons/151658.png",
  },
  {
    id: "iptv_aljadeed_lebanon",
    name: "Al Jadeed",
    streamID: "aljadeed", 
  	logo: "http://picons.cmshulk.com/picons/207201.png",
  },
];

// --- MANIFEST (Bumped version) ---
const manifest = {
    id: "org.joe.lebanese.tv",
    version: "1.2.1", 
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

// --- CATALOG / META HANDLERS (Unchanged) ---
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

// --- STREAM HANDLER (Decryption Heist Logic with 403 Fix) ---
builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== "tv") return { streams: [] };
    const ch = CHANNELS.find((c) => c.id === id);
    if (!ch) return { streams: [] };

    let masterPlaylistUrl;
    
    // Headers needed for both the POST request and the final stream access
    const requiredHeaders = {
        "User-Agent": USER_AGENT,
        "Referer": SCRAPE_REFERER,
        "Origin": ORIGIN,
    };

    // --- DECRYPTION HEIST LOGIC with 403 FIX ---
    if (ch.streamID) {
        console.log(`Requesting encrypted payload for stream ID: ${ch.streamID}`);
        try {
            const response = await axios.post(
                EMBED_RESULT_URL, 
                // The POST body must be application/x-www-form-urlencoded
                `id=${encodeURIComponent(ch.streamID)}`, 
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": requiredHeaders["User-Agent"],
                        "Referer": requiredHeaders.Referer,
                        "Origin": requiredHeaders.Origin, 
                    }
                }
            );

            const data = response.data;

            if (data.error) {
                throw new Error(`API Error: ${data.error}`);
            }

            if (data.link_4 && data.key && data.iv) {
                masterPlaylistUrl = decryptStream(data.link_4, data.key, data.iv);
                console.log(`Decrypted fresh link: ${masterPlaylistUrl}`);
            } else {
                throw new Error("Missing required decryption components (link_4, key, or iv)");
            }

        } catch (err) {
            console.error(`Decryption failed for ${ch.name} (Check headers/endpoint):`, err.message);
            return { streams: [] };
        }
    } else {
        // Direct link
        masterPlaylistUrl = ch.url;
    }
    // --- END OF DECRYPTION HEIST LOGIC ---

    if (!masterPlaylistUrl) {
        console.error(`No masterPlaylistUrl for ${ch.name}. Bailing.`);
        return { streams: [] };
    }

    // Get the mobile-friendly variant URL
    const freshUrl = await fetchFreshPlaylist(masterPlaylistUrl);

    // Proxy headers for the final stream request, only Referer is critical
    const proxyHeaders = {
        "User-Agent": requiredHeaders["User-Agent"],
    };
    
    if (/elahmad\.(xyz|com)/i.test(freshUrl)) {
        proxyHeaders.Referer = requiredHeaders.Referer;
    }

    return {
        streams: [
            {
                url: freshUrl,
                title: ch.name + " (auto-fresh)",
                proxyHeaders: proxyHeaders,
                behaviorHints: { notWebReady: false },
            },
        ],
    };
});

// --- Start Server ---
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese TV add-on running at: http://127.0.0.1:7000/manifest.json");