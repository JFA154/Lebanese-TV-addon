// Lebanese tv — Stremio Add-on
// Run: node index.js

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const CHANNELS = [
  {
    id: "iptv_lbci",
    name: "LBCI",
    url: "https://games1.elahmad.xyz/tv764_www.elahmad.com_lbc/tracks-v1a1/mono.m3u8?token=766dc34755a4638d6c710ae5715390340bdbe9a2-224fced2d510148838fc9e3c2b6b7acb-1762877321-1762866521",
    logo: "http://picons.cmshulk.com/picons/151656.png",
  },
  {
    id: "iptv_mtv_lebanon",
    name: "MTV Lebanon",
    url: "https://shls-live-enc.edgenextcdn.net/out/v1/45ad6fbe1f7149ad9f05f8aefc38f6c0/index_8.m3u8",
    logo: "http://picons.cmshulk.com/picons/151658.png",
  },
  {
    id: "iptv_aljadeed_lebanon",
    name: "Al Jadeed",
    url: "https://games1.elahmad.xyz/tv764_www.elahmad.com_aljadeed/tracks-v1a1/mono.m3u8?token=7304c9345b635e496122812d34f1a9939a419755-0cfc93ffd0c4549f290cf1bb0837195d-1762877039-1762866239",
    logo: "http://picons.cmshulk.com/picons/207201.png",
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
