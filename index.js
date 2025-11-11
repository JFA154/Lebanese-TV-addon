// Lebanese TV — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151656",
    logo: "http://picons.cmshulk.com/picons/151656.png",
    category: "lebanese",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151658",
    logo: "http://picons.cmshulk.com/picons/151658.png",
    category: "lebanese",
  },
  {
    id: "iptv_sky_sports_me",
    name: "Sky Sports Main Event",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/1608071",
    logo: "https://afcdonscast.co.uk/wp-content/uploads/2022/07/sky-sports-main-event-1.webp",
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
    posterShape: "landscape",
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
