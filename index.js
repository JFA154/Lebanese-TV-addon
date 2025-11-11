// Lebanese TV — Stremio Add-on
// Run: node index.js
// 
// ** REQUIRES: npm install axios crypto-js stremio-addon-sdk **
//

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require('axios');
const CryptoJS = require('crypto-js');
// Import cheerio for efficient HTML parsing
const cheerio = require('cheerio'); 

// --- CONSTANTS ---
const SCRAPE_REFERER = "https://www.elahmad.com/";
const EMBED_RESULT_URL = "https://www.elahmad.com/tv/result/embed_result.php";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const ORIGIN = "https://elahmad.com";

// --- HELPERS ---

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
    
    // Decrypted string might contain the full URL with token query
    return decrypted;
}

/**
 * Probes the stream URL to find the H.264/AAC variant.
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
                    if (isH264) return abs; 
                    if (!best) best = abs; 
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

/**
 * NEW HELPER: Scrapes the page for the necessary CSRF token.
 * @param {string} pageUrl The page to scrape.
 * @returns {Promise<string>} The csrf-token string.
 */
async function getCsrfToken(pageUrl) {
    const pageRes = await axios.get(pageUrl, {
        headers: { "User-Agent": USER_AGENT }
    });
    const $ = cheerio.load(pageRes.data);
    const token = $('meta[name="csrf-token"]').attr('content');
    if (!token) {
        // If no token is found, return an empty string/null. The server may accept null.
        return ''; 
    }
    return token;
}


// --- CHANNELS (Updated to include player page for scraping) ---
const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    streamID: "lbc", 
    playerPageUrl: "https://www.elahmad.com/tv/watchtv.php?id=lbc",
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
    playerPageUrl: "https://www.elahmad.com/tv/watchtv.php?id=aljadeed", // Assumed page structure
  	logo: "http://picons.cmshulk.com/picons/207201.png",
  },
];

// --- MANIFEST (Bumped version) ---
const manifest = {
    id: "org.joe.lebanese.tv",
    version: "1.2.2", 
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

// --- STREAM HANDLER (CSRF Token and Decryption Logic) ---
builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== "tv") return { streams: [] };
    const ch = CHANNELS.find((c) => c.id === id);
    if (!ch) return { streams: [] };

    let masterPlaylistUrl;
    
    const requiredHeaders = {
        "User-Agent": USER_AGENT,
        "Referer": SCRAPE_REFERER,
        "Origin": ORIGIN,
    };

    // --- DECRYPTION HEIST LOGIC with CSRF FIX ---
    if (ch.streamID) {
        try {
            // STEP 1: Scrape the CSRF token from the player page
            console.log(`Scraping CSRF token from: ${ch.playerPageUrl}`);
            const csrfToken = await getCsrfToken(ch.playerPageUrl);
            console.log(`Found CSRF Token: ${csrfToken ? 'YES' : 'NO'}`);
            
            // STEP 2: Request the encrypted payload with the token
            console.log(`Requesting encrypted payload for stream ID: ${ch.streamID}`);
            
            const postBody = `id=${encodeURIComponent(ch.streamID)}&csrf_token=${encodeURIComponent(csrfToken)}`;

            const response = await axios.post(
                EMBED_RESULT_URL, 
                postBody, 
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
                // STEP 3: Decrypt
                masterPlaylistUrl = decryptStream(data.link_4, data.key, data.iv);
                console.log(`Decrypted fresh link: ${masterPlaylistUrl}`);
            } else {
                throw new Error("Missing required decryption components (link_4, key, or iv)");
            }

        } catch (err) {
            console.error(`Decryption failed for ${ch.name}:`, err.message);
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

    // Proxy headers for the final stream request
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