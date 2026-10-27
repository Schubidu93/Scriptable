const API = "https://en.wikipedia.org/w/api.php?format=json&";
let h = { headers: { "User-Agent": "ScriptableWidget/1.0 (test)" } };
for (let q of ["2026 La Vuelta Ciclista a España", "2026 Vuelta a España stage"]) {
  let s = await (await fetch(API + "action=query&list=search&srlimit=8&srsearch=" + encodeURIComponent(q), h)).json();
  console.log(q, "→", s.query.search.map(x => x.title).join(" | "));
}
