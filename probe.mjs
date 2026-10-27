const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const clean = h => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
async function show(path) {
  let res = await fetch("https://www.procyclingstats.com/" + path, { headers: { "User-Agent": UA } });
  let html = await res.text();
  console.log(`\n===== ${path}: HTTP ${res.status}, ${html.length} Zeichen, Titel: ${(/<title>([^<]*)/.exec(html) || [])[1]}`);
  for (let m of html.matchAll(/<a[^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) console.log(`  Reiter ${clean(m[2])} data-id=${m[1]} | ${m[0].slice(0, 160)}`);
  for (let m of html.matchAll(/<div[^>]*resTab[^>]*>/gi)) console.log(`  resTab @${m.index}: ${m[0]}`);
  for (let t of html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)) {
    let rows = (t[0].match(/<tr[\s\S]*?<\/tr>/gi) || []).slice(1, 4).map(r => clean(r).slice(0, 90));
    console.log(`  Tabelle @${t.index}: ${rows.join(" || ")}`);
  }
  let h = /<h1[\s\S]*?<\/h1>/i.exec(html); console.log("  h1:", h && clean(h[0]));
  let links = [...new Set([...html.matchAll(/href=["']([^"']*race\/vuelta[^"']*|[^"']*race\/tour-of-guangxi[^"']*)["']/gi)].map(m => m[1]))].slice(0, 40);
  console.log("  Links:", links.join(" "));
}
const races = ["races.php?year=2026&circuit=1&filter=Filter"];
for (let p of ["race/vuelta-a-espana/2026/gc", "race/vuelta-a-espana/2026", "race/vuelta-a-espana/2026/stage-21", "race/vuelta-a-espana-2026-gc", "race/tour-of-guangxi/2026/gc", "race/tour-of-guangxi/2026/stage-6"]) {
  try { await show(p); } catch (e) { console.log(p, e.message); }
}
let res = await fetch("https://www.procyclingstats.com/" + races[0], { headers: { "User-Agent": UA } });
let html = await res.text();
console.log("\nKalender", res.status, [...html.matchAll(/href=["']([^"']*(vuelta|guangxi)[^"']*)["']/gi)].map(m => m[1]).join(" "));
