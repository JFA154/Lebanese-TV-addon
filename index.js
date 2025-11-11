// Lebanese tv — Stremio Add-on
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
    logo: "http://103.176.90.92/images/30496.png",
    category: "sports",
  },
];

const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.1.0",
  name: "Lebanese tv",
  description: "Lebanese TV and Sports channels.",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "lebanese_tv_catalog",
      name: "Lebanese TV",
      extra: [{ name: "search", isRequired: false }],
    },
    {
      type: "tv",
      id: "sports_tv_catalog",
      name: "Sports TV",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  idPrefixes: ["iptv_"],
};

const builder = new addonBuilder(manifest);

// Helper to map channels → metas
function toMeta(ch) {
  return {
    id: ch.id,
    type: "tv",
    name: ch.name,
    poster: ch.logo,
    posterShape: "landscape",
    description: `${ch.name} live stream`,
    // Optional: expose category as a genre
    genres: [ch.category === "lebanese" ? "Lebanese TV" : "Sports"],
  };
}

// Catalogs
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== "tv") return Promise.resolve({ metas: [] });

  const q = (extra?.search || "").toLowerCase();

  let subset = [];
  if (id === "lebanese_tv_catalog") {
    subset = CHANNELS.filter(c => c.category === "lebanese");
  } else if (id === "sports_tv_catalog") {
    subset = CHANNELS.filter(c => c.category === "sports");
  } else {
    subset = []; // unknown catalog
  }

  if (q) {
    subset = subset.filter(
      c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }

  return Promise.resolve({ metas: subset.map(toMeta) });
});

// Meta
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
      genres: [ch.category === "lebanese" ? "Lebanese TV" : "Sports"],
    },
  });
});

// Streams
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

// Start server (Render-friendly if you deploy later)
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese tv add-on running at: http://127.0.0.1:7000/manifest.json");
