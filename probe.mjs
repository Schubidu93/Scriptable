const API = "https://en.wikipedia.org/w/api.php?format=json&origin=*&";
for (let q of ["2026 Vuelta a España", "2026 Tour of Guangxi", "2026 Tour de France", "2026 Il Lombardia"]) {
  let s = await (await fetch(API + "action=query&list=search&srlimit=3&srsearch=" + encodeURIComponent(q))).json();
  let titles = s.query.search.map(x => x.title);
  console.log("\n==", q, "→", titles.join(" | "));
  let title = titles[0];
  let p = await (await fetch(API + "action=parse&prop=wikitext&page=" + encodeURIComponent(title))).json();
  let text = p.parse ? p.parse.wikitext["*"] : "";
  let i = text.search(/general classification/i);
  let rows = [...text.matchAll(/\{\{\s*Cyclingresult\s*\|[^\n]*/gi)].map(m => m[0]);
  console.log("  Länge", text.length, "GC-Index", i, "Cyclingresult-Zeilen", rows.length);
  let gcStart = text.search(/title\s*=\s*[^|\n]*general classification/i);
  console.log("  GC-Tabelle bei", gcStart);
  if (gcStart >= 0) console.log(text.slice(gcStart, gcStart + 900));
  else console.log(rows.slice(0, 4).join("\n"));
}
