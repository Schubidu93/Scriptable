const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&auml;/g,"ä").replace(/&ouml;/g,"ö").replace(/&uuml;/g,"ü").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
const jobs = [
  ["http://www.loipen-allgaeu.de/allg.php", /aktualis|Daten|melde|Quelle|Loipenpfleg|eintrag/i, 1800],
  ["http://www.loipen-allgaeu.de/aktuell.php", /aktualis|Daten|melde|Quelle|gespurt/i, 1500],
  ["https://www.isny.de/urlaub-aktiv/wintersport/schneehoehen-loipenbericht.html", /Loipenbericht|gespurt|Schneeh/i, 3000],
  ["https://www.loipenberichte.de/allgaeu/berichte", /Isny|Wangen|Leutkirch|Missen|Argenb/i, 2000],
  ["https://www.westallgaeu.de/loipen-in-maierhoefen", /gespurt|Loipe|Stand/i, 1500],
  ["https://www.missen-wilhams.de/", /Loipe|Langlauf/i, 800],
  ["https://www.skilift-berger-hoehe.de/", /Loipe|Langlauf|gespurt/i, 1200],
  ["https://www.argenbuehl.de/", /Loipe|Langlauf/i, 800],
  ["https://www.allgaeu.de/langlaufen", /Loipe|gespurt|geöffnet/i, 1000],
];
for (const [url, re, len] of jobs) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000), redirect: "follow" });
    const html = await r.text(); const t = text(html);
    const i = Math.max(0, t.search(re) - 200);
    console.log(`\n##### ${url} → ${r.status} (${r.url}) ${html.length}B\n${t.slice(i, i + len)}`);
    const links = [...html.matchAll(/(?:href|src)=["']([^"']*(?:loipe|langlauf|bericht|iframe|outdooractive|intermaps|feratel|api)[^"']*)["']/gi)].map(m => m[1]);
    console.log("LINKS:", [...new Set(links)].slice(0, 25).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
