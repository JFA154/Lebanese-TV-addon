// Lebanese tv — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151656",
    logo: "http://picons.cmshulk.com/picons/151656.png",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "http://line.trx-ott.com:80/7df41d9cb2/f9e841f009ea/151658",
    logo: "http://picons.cmshulk.com/picons/151658.png",
  },
];

const manifest = {
  id: "org.joe.lebanese.tv",
  version: "1.0.0",
  name: "Lebanese TV",
  description: "Watch live Lebanese channels (LBCI, MTV Lebanon) via IPTV.",
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

/** Catalog: show all channels */
builder.defineCatalogHandler(({ type, id, extra }) => {
  if (type !== "tv" || id !== "lebanese_tv_catalog") return Promise.resolve({ metas: [] });

  const search = extra?.search?.toLowerCase() || "";
  const filtered = CHANNELS.filter(
    ch =>
      !search ||
      ch.name.toLowerCase().includes(search) ||
      ch.id.toLowerCase().includes(search)
  );

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

/** Meta: channel info */
builder.defineMetaHandler(({ type, id }) => {
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

/** Stream: return playable link */
builder.defineStreamHandler(({ type, id }) => {
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

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Lebanese tv add-on running at: http://127.0.0.1:7000/manifest.json");
