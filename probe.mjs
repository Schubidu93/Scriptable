const types = ["Q8502", "Q207326", "Q54050", "Q1595289", "Q3618634", "Q111177881", "Q820144", "Q131860194", "Q12059057"].map(q => `wd:${q}`).join(" ");
const sparql = `SELECT ?item ?label ?ele ?dist WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(9.8809 47.7886)"^^geo:wktLiteral. bd:serviceParam wikibase:radius "40". bd:serviceParam wikibase:distance ?dist. }
 VALUES ?type { ${types} } ?item wdt:P31 ?type. ?item wikibase:sitelinks ?links.
 FILTER EXISTS { ?article schema:about ?item; schema:isPartOf ?wiki. VALUES ?wiki { <https://de.wikipedia.org/> <https://en.wikipedia.org/> } }
 OPTIONAL { ?item wdt:P2044 ?ele. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. } } ORDER BY ?dist LIMIT 150`;
const t0 = Date.now();
const j = await (await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" } })).json();
const rows = j.results.bindings;
console.log("N", rows.length, Date.now() - t0, "ms");
console.log("ALL", rows.map(b => `${b.label.value}(${b.ele ? Math.round(b.ele.value) : "-"}|${Math.round(b.dist.value)}km)`).join(", "));
console.log("TALL", rows.filter(b => b.ele && b.ele.value - 654 >= 200).slice(0, 10).map(b => `${b.label.value}(${Math.round(b.ele.value)}|${Math.round(b.dist.value)}km)`).join(", "));
