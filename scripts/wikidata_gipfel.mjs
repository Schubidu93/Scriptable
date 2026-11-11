// Markante Gipfel aus Wikidata (Berg, Gipfel, Hügel … mit Höhe und Artikel in der deutschen oder englischen
// Wikipedia, dazu die Dominanz) für dasselbe Gebiet wie die OSM-Kacheln: data/gipfel/markant.json mit
// [[Name, Breite, Länge, Höhe, Dominanz in m oder null, Wikipedia-Adresse, Wikidata-ID], …].
// Läuft wöchentlich per GitHub Actions – im Widget scheitert die Abfrage in den Alpen oft am Zeitlimit.

import { writeFile, mkdir } from "node:fs/promises";

// Muss zu OSM_AREA und PEAK_TYPES in Gipfel.js passen
const AREA = { south: 46.5, north: 49.5, west: 8.5, east: 13.5 };
const PEAK_TYPES = ["Q8502", "Q207326", "Q54050", "Q1595289", "Q3618634", "Q111177881", "Q820144", "Q131860194", "Q12059057"]
    .map(q => `wd:${q}`).join(" ");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cell(south, west, north, east) {
    let query = `SELECT ?item ?label ?ele ?coord ?de ?en ?iso WHERE {
 SERVICE wikibase:box { ?item wdt:P625 ?coord. bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral. bd:serviceParam wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral. }
 VALUES ?type { ${PEAK_TYPES} }
 ?item wdt:P31 ?type.
 ?item wdt:P2044 ?ele.
 OPTIONAL { ?de schema:about ?item; schema:isPartOf <https://de.wikipedia.org/>. }
 OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
 FILTER(BOUND(?de) || BOUND(?en))
 OPTIONAL { ?item p:P2659/psn:P2659/wikibase:quantityAmount ?iso. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. }
}`;
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
                headers: { "Accept": "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" },
                signal: AbortSignal.timeout(90000),
            });
            if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
            return (await res.json()).results.bindings;
        } catch (e) {
            last = e;
            console.log(`  Versuch ${attempt + 1}: ${e.message}`);
            await sleep(10000);
        }
    }
    throw last;
}

async function main() {
    let byId = {};
    let failed = 0;
    for (let lat = AREA.south; lat < AREA.north; lat += 1) {
        for (let lon = AREA.west; lon < AREA.east; lon += 1) {
            try {
                let rows = await cell(lat, lon, Math.min(lat + 1, AREA.north), Math.min(lon + 1, AREA.east));
                for (let b of rows) {
                    let m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
                    let id = b.item.value.split("/").pop();
                    if (!m || /^Q\d+$/.test(b.label.value)) continue;
                    let iso = b.iso ? Math.round(Number(b.iso.value)) : null;
                    // Mehrere Typen/Koordinaten: einmal je Wikidata-ID, mit Dominanz bevorzugt
                    if (byId[id] && (byId[id][4] !== null || iso === null)) continue;
                    byId[id] = [b.label.value, +Number(m[2]).toFixed(5), +Number(m[1]).toFixed(5), Math.round(Number(b.ele.value)),
                        iso, b.de ? b.de.value : b.en.value, id];
                }
                console.log(`${lat}/${lon}: ${rows.length} Zeilen`);
            } catch (e) {
                failed++;
                console.log(`${lat}/${lon}: Fehler ${e.message}`);
            }
            await sleep(2000);
        }
    }
    let peaks = Object.values(byId);
    console.log(`${peaks.length} markante Gipfel, ${failed} Fehler`);
    console.log(`Stichprobe: ${JSON.stringify(peaks.filter(p => /^(Wendelstein|Zugspitze|Schwarzer Grat|Blomberg)$/.test(p[0])))}`);
    if (failed || peaks.length < 500) throw new Error("unvollständig – alter Stand bleibt");
    await mkdir("data/gipfel", { recursive: true });
    await writeFile("data/gipfel/markant.json", JSON.stringify(peaks) + "\n");
}

main().catch(e => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 1;
});
