const q = async sparql => (await (await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" } })).json()).results.bindings;
const a = await q(`SELECT ?type ?typeLabel WHERE { wd:Q882913 wdt:P31 ?type. SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } }`);
console.log("TYPES", a.map(b => b.type.value + " " + b.typeLabel.value).join(" | "));
// Häufigste Typen von Objekten mit Höhe im Umkreis 40 km um Kißlegg (ohne die bisherigen)
const t = await q(`SELECT ?type ?typeLabel (COUNT(?item) AS ?n) WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(9.8809 47.7886)"^^geo:wktLiteral. bd:serviceParam wikibase:radius "40". }
 ?item wdt:P31 ?type. ?item wdt:P2044 ?ele.
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } } GROUP BY ?type ?typeLabel ORDER BY DESC(?n) LIMIT 25`);
console.log("COMMON", t.map(b => `${b.type.value.split("/").pop()} ${b.typeLabel.value} (${b.n.value})`).join(" | "));
