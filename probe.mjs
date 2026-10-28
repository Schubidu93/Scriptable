const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const urls = [
  "http://www.loipen-allgaeu.de/loipen.php?name=Leutkirch",
  "http://www.loipen-allgaeu.de/loipen.php?name=Missen-Wilhams",
  "http://www.loipen-allgaeu.de/",
  "https://www.bergfex.de/baden-wuerttemberg/langlaufen/vogt-waldburg/",
  "https://www.bergfex.de/bayern/langlaufen/missen-wilhams/",
  "https://www.sc-vogt.de/langlauf.html",
  "https://www.leutkirch.de/de/Urlaub/Natur-Bewegung/Langlaufen/Loipenbericht",
  "https://waldsee-golf.de/langlauf-loipe",
  "https://www.skiundrad-sgk.de/ski/langlauf/",
  "https://www.sg-niederwangen.de/",
];
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
for (const url of urls) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    const t = text(html);
    const i = Math.max(0, t.search(/gespurt|Loipenbericht|Loipenstatus|km|Schneeh/i) - 300);
    console.log(`\n##### ${url} → ${r.status} ${html.length}B`);
    console.log(t.slice(i, i + 2500));
    const links = [...html.matchAll(/(?:href|src)=["']([^"']*(?:loipe|langlauf|bericht|iframe|name=)[^"']*)["']/gi)].map(m => m[1]);
    console.log("LINKS:", [...new Set(links)].slice(0, 40).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
