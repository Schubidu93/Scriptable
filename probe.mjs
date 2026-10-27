const API = "https://en.wikipedia.org/w/api.php?format=json&origin=*&";
async function wt(title) {
  let p = await (await fetch(API + "action=parse&prop=wikitext&redirects=1&page=" + encodeURIComponent(title))).json();
  return p.parse ? p.parse.wikitext["*"] : "";
}
for (let title of ["2026 Vuelta a España", "2026 Vuelta a España, Stage 12 to Stage 21", "2026 Tour of Guangxi", "2026 Giro d'Italia"]) {
  let text = await wt(title);
  console.log("\n==", title, text.length);
  for (let m of text.matchAll(/general classification/gi)) {
    console.log("  @" + m.index + ": " + text.slice(Math.max(0, m.index - 120), m.index + 250).replace(/\n/g, " ⏎ "));
  }
  let fl = [...text.matchAll(/flagathlete\|[^}]*\}\}/gi)].slice(0, 3).map(m => m[0]);
  console.log("  flagathlete:", fl.join(" | "));
}
