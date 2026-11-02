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

async function query(bbox) {
    let q = `[out:json][timeout:90];node["natural"="peak"]["name"](${bbox});out body;`;
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
        for (let endpoint of ENDPOINTS) {
            try {
                let res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Scriptable-Gipfel-Widget (github.com/Schubidu93/Scriptable)" },
                    body: `data=${encodeURIComponent(q)}`,
                });
                if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
                let json = await res.json();
                if (!Array.isArray(json.elements)) throw new Error(json.remark || "leere Antwort");
                return json.elements;
            } catch (e) {
                last = e;
                console.log(`  ${endpoint}: ${e.message}`);
                await sleep(3000);
            }
        }
        await sleep(15000);
    }
    throw last;
}

async function main() {
    await mkdir("data/gipfel", { recursive: true });
    let ok = 0, failed = 0;
    for (let lat = AREA.south; lat < AREA.north; lat += STEP) {
        for (let lon = AREA.west; lon < AREA.east; lon += STEP) {
            let name = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
            try {
                let elements = await query(`${lat},${lon},${lat + STEP},${lon + STEP}`);
                let peaks = elements.map(e => [e.tags["name:de"] || e.tags.name, +e.lat.toFixed(5), +e.lon.toFixed(5), elevation(e.tags.ele)]);
                await writeFile(`data/gipfel/${name}.json`, JSON.stringify(peaks) + "\n");
                console.log(`${name}: ${peaks.length} Gipfel`);
                ok++;
            } catch (e) {
                // Datei bleibt dann auf dem letzten Stand
                console.log(`${name}: Fehler ${e.message}`);
                failed++;
            }
            await sleep(2000);
        }
    }
    console.log(`${ok} Kacheln geschrieben, ${failed} Fehler`);
    if (!ok) process.exitCode = 1;
}

main();
