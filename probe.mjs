const lat = 47.674, lon = 12.013;
const ov = `[out:json][timeout:15];node["natural"="peak"]["name"](around:15000,${lat},${lon});out body;`;
for (const ep of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]) {
  const t0 = Date.now();
  try {
    const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(ov), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Scriptable-Gipfel-Widget" }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    console.log("OV", ep, r.status, Date.now() - t0, "ms", t.slice(0, 1) === "{" ? JSON.parse(t).elements.length + " Gipfel" : t.slice(0, 80));
  } catch (e) { console.log("OV", ep, "ERR", e.message, Date.now() - t0); }
}
const sparql = `SELECT ?item ?label ?ele ?coord WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "15". }
 VALUES ?type { wd:Q8502 wd:Q207326 wd:Q54050 wd:Q1595289 }
 ?item wdt:P31 ?type.
 OPTIONAL { ?item wdt:P2044 ?ele. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. }
}`;
const t0 = Date.now();
try {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { "Accept": "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" }, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  const b = j.results.bindings;
  console.log("WD", r.status, Date.now() - t0, "ms", b.length, b.slice(0, 8).map(x => `${x.label.value} ${x.ele?.value ?? "-"} ${x.coord.value}`).join(" | "));
} catch (e) { console.log("WD ERR", e.message, Date.now() - t0); }
