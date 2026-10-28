const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const strip = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const html = await (await fetch("https://www.bayrischzell.de/schneebericht", { headers: UA })).text();
const a = html.indexOf("address_4783_CrossCountry"), b = html.lastIndexOf("address_4787_CrossCountry", a);
let s = html.lastIndexOf("<h2", a);
console.log("RAWH:", html.slice(s - 1500, s + 2500));
console.log("\nTEXT HOLZK:", strip(html.slice(s - 3000, a)));
for (const u of ["https://www.lenggries.de/aktiv/winter/schneebericht", "https://www.tsv-oberpframmern.de/skilanglauf/aktueller-loipenbericht", "http://www.altschuetzen-baierbrunn.de/Loipe.html"]) {
  try {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const t = strip(buf.toString(/baierbrunn/.test(u) ? "latin1" : "utf8"));
    const i = Math.max(0, t.search(/Loipenbericht|Loipe/i) - 200);
    console.log(`\n### ${u} ${r.status}\n` + t.slice(i, i + 1800));
  } catch (e) { console.log(u, "ERR", e.message); }
}
