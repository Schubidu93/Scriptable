// OpenStreetMap-Gipfel (natural=peak mit Namen) für Süddeutschland, Vorarlberg und Nordtirol als Kacheln von
// 0,5° × 0,5°: data/gipfel/<lat>_<lon>.json mit [[Name, Breite, Länge, Höhe], …]. Läuft wöchentlich per
// GitHub Actions – die Overpass-Server sind vom iPhone aus oft überlastet; das Widget Gipfel.js liest nur diese
// Dateien (außerhalb des Gebiets fragt es Overpass selbst).

import { writeFile, mkdir } from "node:fs/promises";

// Muss zu OSM_AREA in Gipfel.js passen
const AREA = { south: 46.5, north: 49.5, west: 8.5, east: 13.5 };
const STEP = 0.5;
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// "1838", "1838 m", "1.838,5" → 1838
function elevation(tag) {
    if (!tag) return null;
    let m = /-?\d+(?:[.,]\d+)?/.exec(String(tag).replace(/(\d)\.(\d{3})\b/, "$1$2"));
    return m ? Math.round(Number(m[0].replace(",", "."))) : null;
}

// Eine Abfrage für das ganze Gebiet (schont die Server mehr als 60 einzelne), mit festem Zeitlimit je Versuch
async function query(bbox) {
    let q = `[out:json][timeout:240][maxsize:536870912];node["natural"="peak"]["name"](${bbox});out body;`;
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
        for (let endpoint of ENDPOINTS) {
            try {
                console.log(`Abfrage ${endpoint} …`);
                let res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Scriptable-Gipfel-Widget (github.com/Schubidu93/Scriptable)" },
                    body: `data=${encodeURIComponent(q)}`,
                    signal: AbortSignal.timeout(300000),
                });
                if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
                let json = await res.json();
                if (!Array.isArray(json.elements)) throw new Error(json.remark || "leere Antwort");
                if (json.remark) console.log(`  Hinweis: ${json.remark}`);
                return json.elements;
            } catch (e) {
                last = e;
                console.log(`  ${endpoint}: ${e.message}`);
                await sleep(5000);
            }
        }
        await sleep(30000);
    }
    throw last;
}

async function main() {
    let elements = await query(`${AREA.south},${AREA.west},${AREA.north},${AREA.east}`);
    console.log(`${elements.length} Gipfel im Gebiet`);
    // Zu wenige für Süddeutschland und die Alpen: lieber den alten Stand behalten
    if (elements.length < 1000) throw new Error("unvollständige Antwort");
    let tiles = {};
    for (let lat = AREA.south; lat < AREA.north; lat += STEP) {
        for (let lon = AREA.west; lon < AREA.east; lon += STEP) tiles[`${lat.toFixed(1)}_${lon.toFixed(1)}`] = [];
    }
    for (let e of elements) {
        let key = `${(Math.floor(e.lat / STEP) * STEP).toFixed(1)}_${(Math.floor(e.lon / STEP) * STEP).toFixed(1)}`;
        if (tiles[key]) tiles[key].push([e.tags["name:de"] || e.tags.name, +e.lat.toFixed(5), +e.lon.toFixed(5), elevation(e.tags.ele)]);
    }
    await mkdir("data/gipfel", { recursive: true });
    for (let [key, peaks] of Object.entries(tiles)) await writeFile(`data/gipfel/${key}.json`, JSON.stringify(peaks) + "\n");
    let sizes = Object.entries(tiles).map(([k, p]) => `${k}:${p.length}`);
    console.log(`${sizes.length} Kacheln geschrieben – ${sizes.join(" ")}`);
    let munich = tiles["48.0_11.5"].filter(p => /Olympiaberg|Luitpold|Hypoberg/.test(p[0]));
    console.log(`Stichprobe München: ${JSON.stringify(munich)}`);
}

main().catch(e => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 1;
});
