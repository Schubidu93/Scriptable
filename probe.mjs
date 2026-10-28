const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
for (const url of ["http://www.asv-waldburg.de/ski/langlaufen/loipenbericht", "https://www.asv-waldburg.de/ski/langlaufen/loipenbericht"]) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    const html = await r.text(); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|gespurt|Loipe/i) - 200);
    console.log(`\n##### ${url} → ${r.status} ${r.url} ${html.length}B\n${t.slice(i, i + 3500)}`);
    break;
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
// Loipen-Allgäu: Rohformat eines Einzelloipen-Blocks
const r = await fetch("http://www.loipen-allgaeu.de/loipen.php?name=Wangen", { headers: UA, signal: AbortSignal.timeout(15000) });
const html = Buffer.from(await r.arrayBuffer()).toString("latin1");
const j = html.indexOf("Haslach");
console.log("\n##### LA RAW Block\n" + html.slice(Math.max(0, j - 300), j + 2200));
// Autostrecke Kißlegg → Waldburg (Sportplatz)
const UA2 = { "User-Agent": "Scriptable-Langlauf-Widget/1.0 (github.com/Schubidu93/Scriptable)" };
try {
  const g = await (await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=" + encodeURIComponent("Waldburg, Landkreis Ravensburg"), { headers: UA2, signal: AbortSignal.timeout(15000) })).json();
  const [x, y] = [g[0].lon, g[0].lat];
  const o = await (await fetch(`https://router.project-osrm.org/route/v1/driving/9.8809,47.7886;${x},${y}?overview=false`, { headers: UA2, signal: AbortSignal.timeout(20000) })).json();
  console.log(`\nWaldburg ${y},${x}: ${(o.routes[0].distance / 1000).toFixed(1)} km, ${Math.round(o.routes[0].duration / 60)} min`);
} catch (e) { console.log("Route", e.message); }
