const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
async function show(url, len = 3000, raw = 0) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    const html = await r.text();
    console.log(`\n##### ${url} → ${r.status} ${html.length}B\n${text(html).slice(0, len)}`);
    if (raw) console.log("RAW:", html.slice(0, raw));
    const links = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m => m[1]).filter(l => /intermaps|sdds|resort|report|json|api/i.test(l));
    console.log("LINKS:", [...new Set(links)].slice(0, 30).join(" | "));
    return html;
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); return ""; }
}
await show("https://sdds4.intermaps.com/basic_report/reportdesign_v1.aspx?sddsResortId=36886&font=bayern", 5000, 1500);
await show("https://www.bayern.by/erlebnisse/winter/schneebericht/", 1500);
await show("https://www.tourismus-bw.de/schneebericht", 1500);
await show("https://www.schwarzwald-tourismus.info/service/schneebericht", 600);
