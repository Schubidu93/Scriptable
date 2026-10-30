const types = ["Q8502", "Q207326", "Q54050", "Q1595289", "Q3618634", "Q111177881", "Q820144", "Q131860194", "Q12059057"].map(q => `wd:${q}`).join(" ");
const sparql = `SELECT ?item ?label ?ele ?dist ?iso WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(9.8809 47.7886)"^^geo:wktLiteral. bd:serviceParam wikibase:radius "40". bd:serviceParam wikibase:distance ?dist. }
 VALUES ?type { ${types} } ?item wdt:P31 ?type.
 OPTIONAL { ?de schema:about ?item; schema:isPartOf <https://de.wikipedia.org/>. }
 OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
 FILTER(BOUND(?de) || BOUND(?en))
 OPTIONAL { ?item wdt:P2044 ?ele. }
 OPTIONAL { ?item p:P2659/psn:P2659/wikibase:quantityAmount ?iso. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. } } ORDER BY ?dist LIMIT 150`;
const t0 = Date.now();
const j = await (await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" } })).json();
const rows = j.results.bindings.filter(b => b.ele && b.ele.value - 654 >= 200);
const seen = new Set();
const uniq = rows.filter(b => !seen.has(b.label.value) && seen.add(b.label.value));
console.log("ms", Date.now() - t0, "tall", uniq.length, "mit Dominanz", uniq.filter(b => b.iso).length);
console.log(uniq.map(b => `${b.label.value}(${Math.round(b.dist.value)}km|${b.iso ? Math.round(b.iso.value) + " m" : "–"})`).join(", "));
