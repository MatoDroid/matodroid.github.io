#!/usr/bin/env python3
"""
Stiahne VSETKY cesty (highway=*) Spisskej Novej Vsi z OpenStreetMap a ulozi ich
ako GeoJSON do cesty-snv.geojson, ktory nacitava stranka index.html.

Preco to existuje: verejne Overpass servery su pomale a casto nedostupne, takze
cesty sa uz nesťahuju pri kazdom otvoreni stranky, ale raz sem a ulozia sa.
Ked sa v OSM nieco zmeni, staci tento skript spustit znova a vysledok commitnut.

Pouzitie:
    pip install shapely
    python3 stiahni_cesty_snv.py [vystupny_subor]

Postup:
  1. hranica mesta sa vezme z Nominatimu (OSM relacia 2382009),
  2. cesty sa stiahnu z OSM API po dlazdiciach (API vracia vsetko v obdlzniku a
     odmieta viac nez 50 000 uzlov, takze sa obdlznik adaptivne deli),
  3. cesty sa orezu presne po hranici mesta - zostane IBA Spisska Nova Ves,
  4. vysledok sa zapise ako kompaktny GeoJSON.

Data: (c) prispievatelia OpenStreetMap, licencia ODbL (opendatacommons.org/licenses/odbl).
OSM API ma pravidla pouzitia - skript posiela jednu poziadavku naraz s pauzou a
identifikuje sa v User-Agent.
"""
import gzip
import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from shapely.geometry import LineString, MultiLineString, box, shape
from shapely.prepared import prep

OSM_RELATION_ID = 2382009          # Spisska Nova Ves (boundary=administrative)
OSM_API = "https://api.openstreetmap.org/api/0.6/map"
NOMINATIM = "https://nominatim.openstreetmap.org/lookup"
USER_AGENT = "matodroid-wmts/1.0 (https://github.com/MatoDroid/matodroid.github.io)"

REQUEST_PAUSE_S = 1.0              # pauza medzi poziadavkami
MIN_TILE_DEG = 0.0005              # nikdy nedelime pod ~50 m (poistka proti slucke)
COORD_DECIMALS = 7                 # ~1 cm, viac nema zmysel

# highway=proposed je PLANOVANA cesta, ktora fyzicky neexistuje - na mape by sa
# tvarila ako skutocna, takze ju nebereme
SKIP_HIGHWAY_VALUES = {"proposed"}

# Znacky, ktore nic neprinasaju (zdroje, poznamky, pomocne udaje mapperov)
DROP_TAG_KEYS = {"created_by", "source", "note", "fixme", "FIXME", "comment", "description"}
DROP_TAG_PREFIXES = ("source:", "note:", "check_date", "survey:", "fixme:")


def http_get(url, retries=6):
    """GET s opakovanim pri docasnych chybach. Vracia (status, bytes)."""
    for attempt in range(retries):
        req = urllib.request.Request(
            url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return resp.status, body
        except urllib.error.HTTPError as err:
            if err.code == 400:
                return 400, b""              # "prilis vela uzlov" - vyriesi volajuci delenim
            if err.code in (429, 500, 502, 503, 504, 509):
                wait = int(err.headers.get("Retry-After", 0) or 0) or 15 * (attempt + 1)
                print(f"  HTTP {err.code}, cakam {wait} s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            wait = 10 * (attempt + 1)
            print(f"  siet: {err}, cakam {wait} s...", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Nepodarilo sa stiahnut: {url}")


def fetch_boundary():
    status, body = http_get(
        f"{NOMINATIM}?osm_ids=R{OSM_RELATION_ID}&format=geojson&polygon_geojson=1"
    )
    features = json.loads(body).get("features", [])
    if not features:
        raise RuntimeError("Nominatim nevratil hranicu mesta")
    return shape(features[0]["geometry"]).buffer(0)   # buffer(0) opravi pripadne chyby


def keep_tag(key):
    return key not in DROP_TAG_KEYS and not key.startswith(DROP_TAG_PREFIXES)


def parse_highways(xml_bytes):
    """Z odpovede /map vytiahne highway cesty ako {way_id: (tags, [(lon, lat), ...])}."""
    root = ET.fromstring(xml_bytes)

    nodes = {}
    for node in root.iter("node"):
        nodes[node.get("id")] = (float(node.get("lon")), float(node.get("lat")))

    ways = {}
    for way in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
        # area:highway je plocha (napr. chodnikova plocha), nie cesta
        if "highway" not in tags or tags["highway"] in SKIP_HIGHWAY_VALUES:
            continue
        coords = [nodes[nd.get("ref")] for nd in way.findall("nd") if nd.get("ref") in nodes]
        if len(coords) >= 2:
            ways[way.get("id")] = (tags, coords)
    return ways


def download_tile(west, south, east, north, boundary_prepared, ways, stats):
    """Stiahne obdlznik; ak je v nom prilis vela uzlov, rozdeli ho na styri."""
    tile = box(west, south, east, north)
    if not boundary_prepared.intersects(tile):
        return

    stats["requests"] += 1
    url = f"{OSM_API}?bbox={west:.6f},{south:.6f},{east:.6f},{north:.6f}"
    status, body = http_get(url)

    if status == 400:
        if (east - west) / 2 < MIN_TILE_DEG:
            raise RuntimeError(f"Dlazdica {url} je prilis hustá aj po maximálnom delení")
        mid_lon, mid_lat = (west + east) / 2, (south + north) / 2
        print(f"  prilis vela uzlov, delim ({west:.4f},{south:.4f})-({east:.4f},{north:.4f})",
              file=sys.stderr)
        time.sleep(REQUEST_PAUSE_S)
        for (w, s, e, n) in ((west, south, mid_lon, mid_lat), (mid_lon, south, east, mid_lat),
                             (west, mid_lat, mid_lon, north), (mid_lon, mid_lat, east, north)):
            download_tile(w, s, e, n, boundary_prepared, ways, stats)
        return

    found = parse_highways(body)
    new = sum(1 for way_id in found if way_id not in ways)
    ways.update(found)
    stats["tiles_ok"] += 1
    print(f"  dlazdica {stats['tiles_ok']}: {len(found)} ciest, z toho {new} novych "
          f"(spolu {len(ways)})", file=sys.stderr)
    time.sleep(REQUEST_PAUSE_S)


def round_coords(coords):
    return [[round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)] for x, y in coords]


def clip_to_boundary(coords, boundary, boundary_prepared):
    """Vrati zoznam casti cesty (kazda je zoznam suradnic) lezacich v hranici mesta."""
    line = LineString(coords)
    if boundary_prepared.contains(line):
        return [coords]                       # rychla cesta: cela cesta je vnutri

    if not boundary_prepared.intersects(line):
        return []

    clipped = line.intersection(boundary)
    parts = []
    geoms = getattr(clipped, "geoms", [clipped])
    for geom in geoms:
        if isinstance(geom, LineString) and len(geom.coords) >= 2:
            parts.append(list(geom.coords))
        elif isinstance(geom, MultiLineString):
            parts.extend(list(g.coords) for g in geom.geoms if len(g.coords) >= 2)
    return parts


def build_features(ways, boundary, boundary_prepared):
    features = []
    for way_id in sorted(ways, key=int):
        tags, coords = ways[way_id]
        props = {k: v for k, v in tags.items() if keep_tag(k)}
        parts = clip_to_boundary(coords, boundary, boundary_prepared)
        for index, part in enumerate(parts):
            features.append({
                "type": "Feature",
                # Cesta rozdelena hranicou na viac casti dostane unikatne id
                "id": f"way/{way_id}" if index == 0 else f"way/{way_id}/{index + 1}",
                "properties": props,
                "geometry": {"type": "LineString", "coordinates": round_coords(part)},
            })
    return features


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "cesty-snv.geojson"

    print("Hranica mesta z Nominatimu...", file=sys.stderr)
    boundary = fetch_boundary()
    boundary_prepared = prep(boundary)
    west, south, east, north = boundary.bounds
    print(f"  obdlznik hranice: {west:.4f},{south:.4f} .. {east:.4f},{north:.4f}", file=sys.stderr)
    time.sleep(REQUEST_PAUSE_S)

    print("Stahujem cesty z OSM API...", file=sys.stderr)
    ways, stats = {}, {"requests": 0, "tiles_ok": 0}
    download_tile(west, south, east, north, boundary_prepared, ways, stats)
    print(f"Stiahnute: {len(ways)} ciest v {stats['tiles_ok']} dlazdiciach "
          f"({stats['requests']} poziadaviek)", file=sys.stderr)

    features = build_features(ways, boundary, boundary_prepared)

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "zdroj": "OpenStreetMap",
            "licencia": "ODbL 1.0, (c) prispievatelia OpenStreetMap",
            "hranica": f"OSM relacia {OSM_RELATION_ID} (Spisska Nova Ves)",
            "stiahnute": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "pocet_prvkov": len(features),
        },
        "features": features,
    }

    with open(output, "w", encoding="utf-8") as fh:
        json.dump(collection, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"Zapisane {len(features)} prvkov do {output}", file=sys.stderr)


if __name__ == "__main__":
    main()
