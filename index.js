// Lebanese TV — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const CHANNELS = [
  { id: "iptv_lbci",           name: "LBCI",                 url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/161006.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8d/cc/de/8dccdec8-2ca8-36be-64f4-aed295cb3294/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_mtv_lebanon",    name: "MTV Lebanon",          url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/4215.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/66/eb/89/66eb89db-96d2-8dd0-9adf-1d1c4aca6025/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_aljadeed_lebanon", name: "Al Jadeed",          url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/3133.m3u8",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b7/ba/64/b7ba6403-9257-fe25-1eae-fb016ac753ba/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp",
    category: "lebanese" },
  { id: "iptv_sky_sports_me",  name: "Sky Sports Main Event", url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/1527639.m3u8",
    logo: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Sky-sports-main-event.jpg",
    category: "sports" },
  { id: "iptv_sky_sports_pl",  name: "Sky Sports Premier League", url: "http://hi-ott.me/live/c0dc5bf9f8ff/a69fdf8293/1527637.m3u8",
    logo: "https://static.skyassets.com/contentstack/assets/blt143e20b03d72047e/blt04215f1234c090d0/673cb481bd749a19c4f12807/Sky_Sports_Premier_League_ICON_SQUARE_Full_Bleed_RGB.png",
    category: "sports" },
];

// ---------- Manifest ----------
const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.3.0",
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
    // Hidden from Home: requires an extra param (genre=Sports)
    {
      type: "tv",
      id: "sports_tv_catalog",
      name: "Sports",
      extra: [
        { name: "genre", options: ["Sports"], isRequired: true }, // <-- key line
        { name: "search", isRequired: false }
      ],
    },
  ],
  idPrefixes: ["iptv_"],
};

const builder = new addonBuilder(manifest);

// ---------- Catalog Handler ----------
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== "tv") return Promise.resolve({ metas: [] });

  const q = (extra?.search || "").toLowerCase();

  let subset = [];
  if (id === "lebanese_tv_catalog") {
    subset = CHANNELS.filter(c => c.category === "lebanese");
  } else if (id === "sports_tv_catalog") {
    // Require genre=Sports to match the manifest; this keeps it off Home
    if (extra?.genre !== "Sports") return Promise.resolve({ metas: [] });
    subset = CHANNELS.filter(c => c.category === "sports");
  }

  if (q) {
    subset = subset.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }

  const metas = subset.map(ch => ({
    id: ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "square",
    description: `${ch.name} live stream`,
  }));

  return Promise.resolve({ metas });
});

// ---------- Meta ----------
builder.defineMetaHandler(({ type, id }) => {
  if (type !== "tv") return Promise.resolve({ meta: {} });
  const ch = CHANNELS.find(c => c.id === id);
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

// ---------- Stream ----------
builder.defineStreamHandler(({ type, id }) => {
  if (type !== "tv") return Promise.resolve({ streams: [] });
  const ch = CHANNELS.find(c => c.id === id);
  if (!ch) return Promise.resolve({ streams: [] });

  return Promise.resolve({
    streams: [{ url: ch.url, title: ch.name, behaviorHints: { notWebReady: false } }],
  });
});

// ---------- Start ----------
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Addon at: http://127.0.0.1:7000/manifest.json");
