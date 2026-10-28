const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
const jobs = [
  ["https://missen-wilhams.de/aktuelles/wintersportbericht", /Loipe|gespurt|Stand/i, 2500, true],
  ["https://www.argenbuehl.de/de/Tourismus-Freizeit/Bewegen/Langlaufen", /Loipenbericht|gespurt|Loipe/i, 1800, false],
  ["https://www.westallgaeu.de/schneebericht", /Loipe|gespurt|Argenb|Stand/i, 2000, true],
  ["https://www.allgaeu.de/draussen/langlauf/loipen", /gespurt|geöffnet|Missen|Isny/i, 1500, true],
  ["https://www.allgaeu.de/draussen/schneebericht", /Loipe|Missen|Isny|gespurt/i, 1500, true],
];
for (const [url, re, len, raw] of jobs) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000), redirect: "follow" });
    const html = await r.text(); const t = text(html);
    const i = Math.max(0, t.search(re) - 200);
    console.log(`\n##### ${url} → ${r.status} (${r.url}) ${html.length}B\n${t.slice(i, i + len)}`);
    const links = [...html.matchAll(/(?:href|src|data-[a-z-]+)=["']([^"']*(?:outdooractive|intermaps|feratel|api|json|widget|loipe)[^"']*)["']/gi)].map(m => m[1]);
    console.log("LINKS:", [...new Set(links)].slice(0, 20).join(" | "));
  } catch (e) { console.log(`\n##### ${url} → FEHLER ${e.message}`); }
}
// Isny: HTML-Struktur eines Loipen-Eintrags
const r = await fetch("https://www.isny.de/freizeit-urlaub/wintersport/schneehoehen-loipenbericht.html", { headers: UA });
const html = await r.text(); const j = html.indexOf("Gschwendloipe");
console.log("\n##### ISNY RAW\n" + html.slice(Math.max(0, j - 1800), j + 1500));
const k = html.indexOf("22.10.");
console.log("\n##### ISNY NEWS RAW\n" + html.slice(Math.max(0, k - 600), k + 300));
