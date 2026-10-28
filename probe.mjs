const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
const jobs = [
  ["https://www.bayrischzell.de/schneebericht", 1500],
  ["https://www.snow-online.com/trail-report/cross-country/spitzingsee.html", 2500],
  ["https://www.snow-online.com/trail-report/cross-country/bayrischzell.html", 1200],
  ["https://www.tegernsee.com/", 300],
  ["https://www.schliersee.de/", 300],
  ["https://www.jachenau.de/", 300],
  ["https://www.lenggries.de/", 300],
  ["https://www.toelzer-land.de/", 300],
  ["https://www.muenchen.de/freizeit/langlauf", 2500],
];
for (const [url, len] of jobs) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    const html = await r.text(); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|gespurt|Loipe|Langlauf/i) - 150);
    console.log(`\n##### ${url} → ${r.status} ${r.url} ${html.length}B\n${t.slice(i, i + len)}`);
    console.log("LINKS:", [...new Set([...html.matchAll(/(?:href|src)=["']([^"']*(?:loipe|langlauf|schneebericht|winterbericht|wintersport|intermaps|sdds|outdooractive\.com\/de\/embed|cross-country)[^"']*)["']/gi)].map(m => m[1]))].slice(0, 25).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
