/**
 * Cloudflare Worker pre aplikáciu YT prepisy (https://matodroid.github.io/ytprepis/).
 *
 * Prehliadač nesmie volať YouTube priamo, lebo YouTube neposiela hlavičky CORS.
 * Tento worker beží na strane servera, kde toto obmedzenie neplatí: stiahne
 * údaje z YouTube, vytiahne z nich titulky a vráti ich už ako čisté JSON
 * s povolením pre prehliadač.
 *
 * Nasadenie: pozri README.md v tomto priečinku.
 *
 * Endpointy:
 *   GET /                        – informácia, že worker beží (na overenie adresy)
 *   GET /api/video?v=ID          – prepis videa
 *        &langs=sk,cs,en         – poradie preferovaných jazykov (nepovinné)
 *        &asr=0                  – nepoužiť automatické titulky (predvolene 1)
 *        &tlang=en               – nechať YouTube preložiť titulky (nepovinné)
 *   GET /api/playlist?list=ID    – zoznam videí v playliste
 *   GET /api/proxy?url=ADRESA    – obyčajné preposlanie s hlavičkou CORS
 *   GET /?url=ADRESA             – to isté, kvôli spätnej kompatibilite
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,OPTIONS"
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Verejný kľúč webového klienta YouTube, ktorý používa aj samotná stránka.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const RE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const RE_LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

/* ------------------------------------------------------------ pomôcky */

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, CORS)
  });
}

function ytFetch(url, init) {
  const opts = init || {};
  return fetch(url, {
    method: opts.method || "GET",
    body: opts.body,
    headers: Object.assign({
      "user-agent": UA,
      "accept-language": "en-US,en;q=0.9",
      // obíde uvítaciu stránku so súhlasom s cookies
      "cookie": "CONSENT=YES+cb; SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg"
    }, opts.headers || {})
  });
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " "
};

function decodeEntities(s) {
  if (!s || s.indexOf("&") === -1) return s || "";
  const once = String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (whole, code) {
    if (code.charAt(0) === "#") {
      const num = code.charAt(1) === "x" || code.charAt(1) === "X"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return isFinite(num) ? String.fromCodePoint(num) : whole;
    }
    const named = ENTITIES[code.toLowerCase()];
    return named === undefined ? whole : named;
  });
  // YouTube niektoré znaky escapuje dvakrát (&amp;#39;)
  return once.indexOf("&") === -1 ? once : decodeEntities(once);
}

function matchBrace(t, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

function extractJson(text, key) {
  let i = text.indexOf(key);
  while (i !== -1) {
    const eq = text.indexOf("=", i);
    if (eq === -1) return null;
    let s = eq + 1;
    while (s < text.length && /\s/.test(text[s])) s++;
    if (text[s] === "{") {
      const end = matchBrace(text, s);
      if (end > 0) {
        try { return JSON.parse(text.slice(s, end)); } catch (e) { /* skúsime ďalší výskyt */ }
      }
    }
    i = text.indexOf(key, i + key.length);
  }
  return null;
}

function deepCollect(node, key, out, depth) {
  if (!node || typeof node !== "object" || depth > 30) return out;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) deepCollect(node[i], key, out, depth + 1);
    return out;
  }
  for (const k in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
    if (k === key && node[k] && typeof node[k] === "object") out.push(node[k]);
    else deepCollect(node[k], key, out, depth + 1);
  }
  return out;
}

function runsToText(o) {
  if (!o) return "";
  if (typeof o === "string") return o;
  if (o.simpleText) return o.simpleText;
  if (o.runs) return o.runs.map(function (r) { return r.text || ""; }).join("");
  return "";
}

/* ------------------------------------------------------------ titulky */

function parseJson3(txt) {
  let data;
  try { data = JSON.parse(txt); } catch (e) { return []; }
  if (!data || !data.events) return [];
  const cues = [];
  data.events.forEach(function (ev) {
    if (!ev.segs || ev.aAppend === 1) return;
    const text = ev.segs.map(function (s) { return s.utf8 || ""; }).join("").replace(/\s+/g, " ").trim();
    if (!text) return;
    cues.push({
      start: (ev.tStartMs || 0) / 1000,
      dur: (ev.dDurationMs || 0) / 1000,
      text: text
    });
  });
  return cues;
}

// Titulky môžu obsahovať značky priamo (<i>) aj zakódované (&lt;i&gt;),
// preto sa odstraňujú pred aj po dekódovaní entít.
function cleanCaptionText(raw) {
  let t = String(raw).replace(/<[^>]*>/g, " ");
  t = decodeEntities(t);
  t = t.replace(/<[^>]*>/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// Worker nemá DOMParser, XML preto čítame regulárnym výrazom.
function parseTimedXml(xml) {
  const cues = [];
  const re = /<text([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const start = parseFloat((attrs.match(/\bstart="([^"]*)"/) || [])[1] || "0");
    const dur = parseFloat((attrs.match(/\bdur="([^"]*)"/) || [])[1] || "0");
    const text = cleanCaptionText(m[2]);
    if (text && isFinite(start)) cues.push({ start: start, dur: isFinite(dur) ? dur : 0, text: text });
  }
  return cues;
}

function pickTrack(tracks, prefs, allowAsr) {
  const cand = tracks.filter(function (t) { return allowAsr || t.kind !== "asr"; });
  if (!cand.length) return null;
  const manualFirst = function (list) {
    return list.filter(function (t) { return t.kind !== "asr"; })[0] || list[0];
  };
  for (let i = 0; i < prefs.length; i++) {
    const p = String(prefs[i]).toLowerCase();
    if (!p) continue;
    const exact = cand.filter(function (t) { return String(t.languageCode || "").toLowerCase() === p; });
    if (exact.length) return manualFirst(exact);
    const base = p.split("-")[0];
    const loose = cand.filter(function (t) {
      return String(t.languageCode || "").toLowerCase().split("-")[0] === base;
    });
    if (loose.length) return manualFirst(loose);
  }
  return manualFirst(cand);
}

function addParams(base, params) {
  const u = new URL(base, "https://www.youtube.com");
  Object.keys(params).forEach(function (k) {
    if (params[k] === null || params[k] === undefined || params[k] === "") u.searchParams.delete(k);
    else u.searchParams.set(k, params[k]);
  });
  return u.toString();
}

/* --------------------------------------------- získanie údajov o videu */

async function playerFromWatchPage(videoId) {
  const url = "https://www.youtube.com/watch?v=" + videoId + "&hl=en&bpctr=9999999999&has_verified=1";
  const r = await ytFetch(url);
  if (!r.ok) throw new Error("YouTube vrátil HTTP " + r.status);
  const html = await r.text();
  const pr = extractJson(html, "ytInitialPlayerResponse");
  if (!pr) throw new Error("v stránke videa sa nenašli údaje prehrávača");
  return pr;
}

// Záloha: oficiálne rozhranie prehrávača. Občas vráti titulky aj vtedy,
// keď je stránka videa zablokovaná kontrolou robotov.
async function playerFromInnertube(videoId) {
  const body = {
    videoId: videoId,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.09.37",
        androidSdkVersion: 30,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: 0
      }
    }
  };
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?key=" + INNERTUBE_KEY, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      "x-youtube-client-name": "3",
      "x-youtube-client-version": "19.09.37"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("rozhranie prehrávača vrátilo HTTP " + r.status);
  return await r.json();
}

function tracksOf(pr) {
  const cap = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
  return (cap && cap.captionTracks) || [];
}

async function loadCues(track, tlang) {
  const r1 = await ytFetch(addParams(track.baseUrl, { fmt: "json3", tlang: tlang || null }));
  if (r1.ok) {
    const cues = parseJson3(await r1.text());
    if (cues.length) return cues;
  }
  const r2 = await ytFetch(addParams(track.baseUrl, { fmt: null, tlang: tlang || null }));
  if (!r2.ok) throw new Error("titulky sa nepodarilo stiahnuť (HTTP " + r2.status + ")");
  return parseTimedXml(await r2.text());
}

async function getVideo(params) {
  const videoId = String(params.get("v") || "").trim();
  if (!RE_VIDEO_ID.test(videoId)) return { error: "chýba alebo je neplatné ID videa" };

  const prefs = String(params.get("langs") || "").split(/[,\s]+/).filter(Boolean);
  const allowAsr = params.get("asr") !== "0";
  const tlang = String(params.get("tlang") || "").trim();

  let pr = null, problem = "";
  try {
    pr = await playerFromWatchPage(videoId);
  } catch (e) {
    problem = e.message || String(e);
  }
  if (!pr || !tracksOf(pr).length) {
    try {
      const alt = await playerFromInnertube(videoId);
      if (tracksOf(alt).length || !pr) pr = alt;
    } catch (e) {
      if (!pr) return { error: problem || e.message || String(e) };
    }
  }

  const details = pr.videoDetails || {};
  const status = pr.playabilityStatus || {};
  const meta = {
    id: videoId,
    title: details.title || videoId,
    author: details.author || "",
    duration: parseInt(details.lengthSeconds || 0, 10) || 0
  };

  const tracks = tracksOf(pr);
  if (!tracks.length) {
    meta.error = status.status && status.status !== "OK"
      ? (runsToText(status.reason) || status.status)
      : "video nemá žiadne titulky";
    return meta;
  }

  const track = pickTrack(tracks, prefs, allowAsr);
  if (!track) {
    meta.error = "k dispozícii sú len automatické titulky";
    return meta;
  }

  meta.lang = track.languageCode || "";
  meta.kind = track.kind === "asr" ? "asr" : "manual";
  if (tlang) meta.tlang = tlang;
  meta.cues = await loadCues(track, tlang);
  if (!meta.cues.length) meta.error = "prepis prišiel prázdny";
  return meta;
}

async function getPlaylist(params) {
  const listId = String(params.get("list") || "").trim();
  if (!RE_LIST_ID.test(listId)) return { error: "chýba alebo je neplatné ID playlistu" };

  const r = await ytFetch("https://www.youtube.com/playlist?list=" + listId + "&hl=en");
  if (!r.ok) return { error: "YouTube vrátil HTTP " + r.status };
  const html = await r.text();

  const videos = [], seen = {};
  const data = extractJson(html, "ytInitialData");
  if (data) {
    deepCollect(data, "playlistVideoRenderer", [], 0).forEach(function (v) {
      if (v.videoId && !seen[v.videoId]) {
        seen[v.videoId] = 1;
        videos.push({ id: v.videoId, title: runsToText(v.title) });
      }
    });
  }
  if (!videos.length) {
    const re = /"videoId":"([A-Za-z0-9_-]{11})"/g;
    let m;
    while ((m = re.exec(html))) {
      if (!seen[m[1]]) { seen[m[1]] = 1; videos.push({ id: m[1], title: "" }); }
    }
  }
  if (!videos.length) return { error: "playlist je prázdny alebo neprístupný" };

  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  return {
    list: listId,
    title: t ? decodeEntities(t[1]).replace(/\s*-\s*YouTube\s*$/, "").trim() : listId,
    videos: videos
  };
}

async function passthrough(target) {
  if (!target) return json({ error: "chýba parameter url" }, 400);
  let parsed;
  try { parsed = new URL(target); } catch (e) { return json({ error: "neplatná adresa" }, 400); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return json({ error: "podporované je len http a https" }, 400);
  }
  const r = await ytFetch(target);
  const headers = new Headers(CORS);
  headers.set("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
  return new Response(r.body, { status: r.status, headers: headers });
}

/* ------------------------------------------------------------ smerovanie */

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET" && req.method !== "HEAD") {
      return json({ error: "podporovaná je len metóda GET" }, 405);
    }

    const u = new URL(req.url);
    const path = u.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/video") return json(await getVideo(u.searchParams));
      if (path === "/api/playlist") return json(await getPlaylist(u.searchParams));
      if (path === "/api/proxy") return await passthrough(u.searchParams.get("url"));
      if (u.searchParams.get("url")) return await passthrough(u.searchParams.get("url"));
      if (path === "/" || path === "/api") {
        return json({
          ok: true,
          service: "ytprepis-worker",
          version: 1,
          endpoints: ["/api/video?v=ID", "/api/playlist?list=ID", "/api/proxy?url=ADRESA"]
        });
      }
      return json({ error: "neznámy endpoint: " + path }, 404);
    } catch (e) {
      return json({ error: (e && e.message) || String(e) }, 502);
    }
  }
};
