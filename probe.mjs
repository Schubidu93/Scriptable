const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&auml;/g,"ä").replace(/&ouml;/g,"ö").replace(/&uuml;/g,"ü").replace(/&szlig;/g,"ß").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
async function get(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) }); return { status: r.status, url: r.url, html: await r.text() }; }
// Loipen-Allgäu Wangen: alles nach dem Loipenbericht (Einzelloipen?)
try {
  const { html } = await get("http://www.loipen-allgaeu.de/loipen.php?name=Wangen");
  const t = text(html); const i = t.search(/schwere Loipen/i);
  console.log("##### LA Wangen nach Summen\n" + t.slice(i, i + 3500));
  const j = html.search(/Berger|Niederwangen|Deuchelried/i);
  console.log("##### LA Wangen RAW Einzelloipe\n" + html.slice(Math.max(0, j - 1500), j + 1500));
} catch (e) { console.log("LA", e.message); }
for (const url of ["https://www.nordicarena.de/loipeninformationen/", "https://www.gemeinde-vogt.de/de/tourismus/langlaufloipen", "https://www.waldburg.de/", "https://www.sc-vogt.de/langlauf.html"]) {
  try {
    const { status, url: u, html } = await get(url); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|gespurt|Loipe/i) - 300);
    console.log(`\n##### ${url} → ${status} ${u}\n${t.slice(i, i + (url.includes("sc-vogt") ? 1500 : 2500))}`);
    console.log("LINKS:", [...new Set([...html.matchAll(/href=["']([^"']*(?:loipe|langlauf|bericht|winter)[^"']*)["']/gi)].map(m => m[1]))].slice(0, 20).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
