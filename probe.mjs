const q = async sparql => (await (await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" } })).json()).results.bindings;
const r = await q(`SELECT ?item ?typeLabel ?ele ?coord ?iso ?article WHERE {
 VALUES ?article { <https://de.wikipedia.org/wiki/Hochberg_(Allg%C3%A4uer_Alpen)> }
 ?article schema:about ?item.
 OPTIONAL { ?item wdt:P31 ?type. } OPTIONAL { ?item wdt:P2044 ?ele. } OPTIONAL { ?item wdt:P625 ?coord. }
 OPTIONAL { ?item p:P2659/psn:P2659/wikibase:quantityAmount ?iso. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } }`);
console.log(JSON.stringify(r.map(b => ({ item: b.item.value, type: b.typeLabel?.value, ele: b.ele?.value, coord: b.coord?.value, iso: b.iso?.value }))));
// Entfernung ab Kißlegg
for (const b of r.slice(0, 1)) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || "");
  if (m) { const rad = x => x * Math.PI / 180, a = { lat: 47.7886, lon: 9.8809 }, c = { lat: +m[2], lon: +m[1] };
    const h = Math.sin(rad(c.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(c.lat)) * Math.sin(rad(c.lon - a.lon) / 2) ** 2;
    console.log("km", (12742 * Math.asin(Math.sqrt(h))).toFixed(1)); }
}
