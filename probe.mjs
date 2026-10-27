const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const clean = h => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
async function show(url) {
  try {
    let res = await fetch(url, { headers: { "User-Agent": UA } });
    let html = await res.text();
    console.log(`\n== ${url}: ${res.status}, ${html.length} Zeichen, Titel: ${(/<title>([^<]*)/.exec(html) || [])[1]}`);
    let t = (html.match(/<table[\s\S]*?<\/table>/gi) || []).slice(0, 3);
    t.forEach((x, i) => console.log(`  Tabelle ${i}: ${(x.match(/<tr[\s\S]*?<\/tr>/gi) || []).slice(0, 4).map(r => clean(r).slice(0, 80)).join(" || ")}`));
  } catch (e) { console.log(url, e.message); }
}
await show("https://firstcycling.com/race.php?r=23&y=2026");
await show("https://firstcycling.com/race.php?r=23&y=2026&k=2");
await show("https://firstcycling.com/race.php?y=2026&t=2");
await show("https://en.wikipedia.org/w/api.php?action=parse&page=2026_Vuelta_a_Espa%C3%B1a&prop=sections&format=json");
await show("https://www.procyclingstats.com/race/vuelta-a-espana/2026/gc");
