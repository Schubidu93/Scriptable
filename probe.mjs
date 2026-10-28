const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&ouml;/g,"ö").replace(/&auml;/g,"ä").replace(/&uuml;/g,"ü").replace(/&szlig;/g,"ß").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
const urls = [
  "https://www.tsv-oberpframmern.de/skilanglauf/aktueller-loipenbericht",
  "https://waldsportpark-ebersberg.de/index.php/sportangebot/skilaunglauf/",
  "http://www.wsv-glonn.de/loipe/",
  "https://otterfing.de/loipe",
  "http://www.tsv-hartpenning.de/loipeninfo/",
  "http://www.tsvweyarn.de/index.php/langlauf-loipe",
  "https://www.roggersdorf.com/umgebung/langlaufloipe/",
  "https://wsv-vagen.de/langlauf/langlauf-aktuelles.html",
  "http://www.golfclub-woerthsee.de/",
  "http://www.tutzinger-loipe.de/",
  "http://www.svsoecking.de/sportangebot/ski/loipe.html",
  "http://www.altschuetzen-baierbrunn.de/Loipe.html",
  "http://www.geretsried.de/sport/loipe/",
  "http://www.wsv-zellerreit.de/skisport/aktuelles.html",
  "https://www.tegernsee-schliersee.de/langlaufen-rund-um-holzkirchen-1",
];
await Promise.all(urls.map(async url => {
  let out;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    const html = await r.text(); const t = text(html);
    const i = Math.max(0, t.search(/Loipenbericht|Loipenzustand|gespurt|Loipe ist|Loipen sind|Stand:/i) - 250);
    const dates = [...new Set(t.match(/\b\d{1,2}\.\d{1,2}\.(20)?\d{2}\b/g) || [])].slice(0, 8).join(" ");
    out = `\n##### ${url} → ${r.status} ${r.url} ${html.length}B · Daten: ${dates}\n${t.slice(i, i + 900)}`;
  } catch (e) { out = `\n##### ${url} → FEHLER ${e.message}`; }
  console.log(out);
}));
