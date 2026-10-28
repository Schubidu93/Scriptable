const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&ouml;/g,"ö").replace(/&auml;/g,"ä").replace(/&uuml;/g,"ü").replace(/&szlig;/g,"ß").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
async function get(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) }); return { status: r.status, url: r.url, html: await r.text() }; }
try { const { status, html } = await get("https://christoph-moder.de/winter/loipen.php");
  console.log(`##### moder ${status}\n` + text(html).slice(0, 9000));
  console.log("LINKS:", [...new Set([...html.matchAll(/href=["'](http[^"']+)["']/gi)].map(m => m[1]))].join(" | ").slice(0, 6000));
} catch (e) { console.log("moder", e.message); }
for (const [url, len] of [["https://www.jachenau.de/loipenbericht", 2500], ["http://www.waldsportpark-ebersberg.de/", 1500], ["https://www.feldkirchen-westerham.de/", 300], ["https://www.woerthsee.de/", 300]]) {
  try { const { status, url: u, html } = await get(url); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|Loipe|gespurt/i) - 200);
    console.log(`\n##### ${url} → ${status} ${u}\n${t.slice(i, i + len)}`);
    console.log("LINKS:", [...new Set([...html.matchAll(/href=["']([^"']*(?:loipe|langlauf|winter|schnee)[^"']*)["']/gi)].map(m => m[1]))].slice(0, 20).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
