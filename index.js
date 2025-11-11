// Lebanese TV — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151656",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8d/cc/de/8dccdec8-2ca8-36be-64f4-aed295cb3294/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/400x400ia-75.webp",
    category: "lebanese",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151658",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/66/eb/89/66eb89db-96d2-8dd0-9adf-1d1c4aca6025/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/400x400ia-75.webp",
    category: "lebanese",
  },
  {
    id: "iptv_sky_sports_me",
    name: "Sky Sports Main Event",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/1608071",
    logo: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/83/13/db/8313dbed-1929-a962-c434-44fed5a68125/GB-AppIcon-0-1x_U007emarketing-0-8-85-220-0.png/400x400ia-75.webp",
    category: "sports",
  },
];

// ---------- Manifest ----------
const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.2.0",
  name: "Lebanese & Sports TV",
  description: "Live Lebanese and Sports channels.",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "lebanese_tv_catalog",
      name: "Lebanon",
      extra: [{ name: "search", isRequired: false }],
    },
    {
      type: "tv",
      id: "sports_tv_catalog",
      name: "Sports",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  idPrefixes: ["iptv_"],
};

const builder = new addonBuilder(manifest);

// ---------- Catalog Handler ----------
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== "tv") return Promise.resolve({ metas: [] });

  const q = (extra?.search || "").toLowerCase();
  let filtered = [];

  if (id === "lebanese_tv_catalog") {
    filtered = CHANNELS.filter(ch => ch.category === "lebanese");
  } else if (id === "sports_tv_catalog") {
    filtered = CHANNELS.filter(ch => ch.category === "sports");
  }

  if (q) {
    filtered = filtered.filter(
      ch =>
        ch.name.toLowerCase().includes(q) ||
        ch.id.toLowerCase().includes(q)
    );
  }

  const metas = filtered.map(ch => ({
    id: ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "square",
    description: `${ch.name} live stream`,
  }));

  return Promise.resolve({ metas });
});

// ---------- Meta Handler ----------
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

// ---------- Stream Handler ----------
builder.defineStreamHandler(({ type, id }) => {
  if (type !== "tv") return Promise.resolve({ streams: [] });
  const ch = CHANNELS.find(c => c.id === id);
  if (!ch) return Promise.resolve({ streams: [] });

  return Promise.resolve({
    streams: [
      {
        url: ch.url,
        title: ch.name,
        behaviorHints: { notWebReady: false },
      },
    ],
  });
});

// ---------- Start Server ----------
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese & Sports TV add-on running at: http://127.0.0.1:7000/manifest.json");
