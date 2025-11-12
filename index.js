// Lebanese TV — Stremio Add-on (auto-detect HLS qualities)
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = (...args) => import("node-fetch").then(m => m.default(...args));

const CHANNELS = [
  { id: "iptv_lbci",           name: "LBCI",
    url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/161006.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8d/cc/de/8dccdec8-2ca8-36be-64f4-aed295cb3294/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_mtv_lebanon",    name: "MTV Lebanon",
    url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/4215.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/66/eb/89/66eb89db-96d2-8dd0-9adf-1d1c4aca6025/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_aljadeed_lebanon", name: "Al Jadeed",
    url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/3133.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b7/ba/64/b7ba6403-9257-fe25-1eae-fb016ac753ba/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_sky_sports_me",  name: "Sky Sports Main Event",
    url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/1527639.m3u8",
    logo: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Sky-sports-main-event.jpg",
    category: "sports" },
  { id: "iptv_sky_sports_pl",  name: "Sky Sports Premier League",
    url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/1527637.m3u8",
    logo: "https://static.skyassets.com/contentstack/assets/blt143e20b03d72047e/blt04215f1234c090d0/673cb481bd749a19c4f12807/Sky_Sports_Premier_League_ICON_SQUARE_Full_Bleed_RGB.png",
    category: "sports" },
];

// ---------- Manifest ----------
const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.5.0",
  name: "Lebanese & Sports TV",
  description: "Live Lebanese and Sports channels.",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  catalogs: [
    // Shows on Home (no required extras)
    {
      type: "tv",
      id: "lebanese_tv_catalog",
      name: "Lebanon",
      extra: [{ name: "search", isRequired: false }],
    },
    // Hidden from Home: requires an extra param (kept off Home; visible in Discover)
    {
      type: "tv",
      id: "sports_tv_catalog",
      name: "Sports",
      extra: [
        { name: "genre", options: ["Sky Sports"], isRequired: true },
        { name: "search", isRequired: false }
      ],
    },
  ],
  idPrefixes: ["iptv_"],
};

const builder = new addonBuilder(manifest);

// ---------- Helpers ----------
function qualityLabelFromHeight(h) {
  if (h >= 2160) return "4K UHD";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720)  return "720p";
  if (h >= 540)  return "540p";
  if (h >= 480)  return "480p";
  return `${h}p`;
}

function shortCodec(codecs) {
  if (!codecs) return "";
  const lc = codecs.toLowerCase();
  const hasH264 = lc.includes("avc1");
  const hasH265 = lc.includes("hev1") || lc.includes("hvc1");
  const hasAAC  = lc.includes("mp4a");
  const v = hasH265 ? "H.265" : (hasH264 ? "H.264" : "");
  const a = hasAAC ? "AAC" : "";
  return [v, a].filter(Boolean).join("/");
}

// Try URL as master; if not, try parent {index,master}.m3u8; return list of variants.
async function getHlsVariants(seedUrl) {
  async function fetchText(u) {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.text();
  }

  async function parseMaster(u) {
    const txt = await fetchText(u);
    if (!txt) return null;

    const lines = txt.split(/\r?\n/);
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith("#EXT-X-STREAM-INF")) {
        const attrs = Object.fromEntries(
          l
            .slice("#EXT-X-STREAM-INF:".length)
            .split(",")
            .map(p => p.split("=").map(s => s.trim()))
            .map(([k, v]) => [k, v?.replace(/^"|"$/g, "")])
        );

        const next = lines[i + 1] || "";
        if (!next || !/\.m3u8(\?|$)/i.test(next)) continue;

        const res = (attrs.RESOLUTION || "").toLowerCase(); // e.g., 1920x1080
        const [wStr, hStr] = res.split("x");
        const w = parseInt(wStr, 10) || 0;
        const h = parseInt(hStr, 10) || 0;

        const bw = parseInt(attrs.BANDWIDTH || "0", 10); // bits per second
        const mbps = bw ? (bw / 1e6).toFixed(1) : null;

        const codecs = attrs.CODECS || "";

        const absUrl = new URL(next, u).toString();

        variants.push({
          url: absUrl,
          width: w,
          height: h,
          bandwidth: mbps,
          codecs
        });
      }
    }
    return variants.length ? variants : null;
  }

  // 1) Treat seed as master
  let variants = await parseMaster(seedUrl);
  if (variants) return variants;

  // 2) Try parent index/master
  const base = new URL("./", seedUrl).toString();
  for (const cand of ["index.m3u8", "master.m3u8"]) {
    const u = new URL(cand, base).toString();
    variants = await parseMaster(u);
    if (variants) return variants;
  }

  // 3) No variants found; return empty array
  return [];
}

// ---------- Catalog Handler ----------
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "tv") return { metas: [] };

  const q = (extra?.search || "").toLowerCase();

  let subset = [];
  if (id === "lebanese_tv_catalog") {
    subset = CHANNELS.filter(c => c.category === "lebanese");
  } else if (id === "sports_tv_catalog") {
    const wantsSports = !extra?.genre || extra.genre === "Sports";
    subset = wantsSports ? CHANNELS.filter(c => c.category === "sports") : [];
  }

  if (q) {
    subset = subset.filter(c =>
      c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }

  const metas = subset.map(ch => ({
    id: ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "square",
    description: `${ch.name} live stream`,
  }));

  return { metas };
});

// ---------- Meta Handler ----------
builder.defineMetaHandler(({ type, id }) => {
  if (type !== "tv") return { meta: {} };
  const ch = CHANNELS.find(c => c.id === id);
  if (!ch) return { meta: {} };
  return {
    meta: {
      id: ch.id,
      type: "tv",
      name: ch.name,
      poster: ch.logo,
      background: ch.logo,
      description: `${ch.name} live broadcast.`,
    },
  };
});

// ---------- Stream Handler (auto qualities) ----------
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv") return { streams: [] };
  const ch = CHANNELS.find(c => c.id === id);
  if (!ch) return { streams: [] };

  const variants = await getHlsVariants(ch.url);

  if (variants.length) {
    // Sort by height desc (4K → 1080p → …). If height not provided, sort by bandwidth.
    variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));

    const streams = variants.map(v => {
      const q = v.height ? qualityLabelFromHeight(v.height) : (v.bandwidth ? `${v.bandwidth} Mbps` : "Auto");
      const codec = shortCodec(v.codecs);
      const label = codec ? `${ch.name} (${q}, ${codec})` : `${ch.name} (${q})`;
      return {
        url: v.url,
        title: label,
        behaviorHints: { notWebReady: false },
        // If any host needs headers, you can add per-channel headers:
        // proxyHeaders: { "User-Agent": "...", "Referer": "..." }
      };
    });

    return { streams };
  }

  // Fallback: no variants found, return the seed URL as-is
  return {
    streams: [
      { url: ch.url, title: ch.name, behaviorHints: { notWebReady: false } }
    ]
  };
});

// ---------- Start ----------
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Addon at: http://127.0.0.1:7000/manifest.json");
