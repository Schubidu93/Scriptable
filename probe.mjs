const q = async sparql => (await (await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" } })).json()).results.bindings;
const a = await q(`SELECT ?item ?label ?typeLabel ?links ?ele ?coord WHERE {
 ?item rdfs:label "Schwarzer Grat"@de. ?item wikibase:sitelinks ?links.
 OPTIONAL { ?item wdt:P31 ?type. } OPTIONAL { ?item wdt:P2044 ?ele. } OPTIONAL { ?item wdt:P625 ?coord. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. ?type rdfs:label ?typeLabel. } }`);
console.log("SG", JSON.stringify(a.map(b => [b.item.value, b.typeLabel?.value, b.links.value, b.ele?.value, b.coord?.value])));
const lat = 47.7886, lon = 9.8809;
const n = await q(`SELECT ?label ?links ?ele ?dist WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "40". bd:serviceParam wikibase:distance ?dist. }
 VALUES ?type { wd:Q8502 wd:Q207326 wd:Q54050 wd:Q1595289 } ?item wdt:P31 ?type. ?item wikibase:sitelinks ?links. FILTER(?links > 0)
 OPTIONAL { ?item wdt:P2044 ?ele. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. } } ORDER BY DESC(?links) DESC(?ele) LIMIT 40`);
console.log("NOTABLE", n.map(b => `${b.label.value}(${b.links.value}|${b.ele?.value ?? "-"}|${Math.round(b.dist.value)}km)`).join(", "));
