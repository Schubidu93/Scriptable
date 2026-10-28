const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&ouml;/g,"ö").replace(/&auml;/g,"ä").replace(/&uuml;/g,"ü").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
async function get(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) }); return { status: r.status, url: r.url, html: await r.text() }; }
{ const { html } = await get("https://www.bayrischzell.de/schneebericht");
  const t = text(html); const i = t.indexOf("Die aktuellen Schnee-Daten");
  console.log("##### ATS ALLE\n" + t.slice(i, i + 6000));
  const j = html.indexOf("Loipen: Langlaufsaison");
  console.log("##### ATS RAW\n" + html.slice(Math.max(0, j - 2500), j + 600)); }
for (const [url, len] of [["https://www.bayrischzell.de/de/schneebericht-bayrischzell", 2500], ["https://www.tegernsee.com/schneebericht", 2500], ["https://www.lenggries.de/aktiv/winter/schneebericht", 2500], ["https://www.jachenau.de/unser-langlaufparadies-1", 2000]]) {
  try { const { status, url: u, html } = await get(url); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|Loipen|gespurt|Schneeh/i) - 200);
    console.log(`\n##### ${url} → ${status} ${u}\n${t.slice(i, i + len)}`);
    console.log("LINKS:", [...new Set([...html.matchAll(/(?:href|src)=["']([^"']*(?:loipe|langlauf|schneebericht|intermaps|sdds|feratel|widget|api)[^"']*)["']/gi)].map(m => m[1]))].slice(0, 20).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
