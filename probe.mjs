const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
async function get(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) }); return { status: r.status, html: await r.text() }; }
const show = (label, s) => console.log(`\n##### ${label}\n${s}`);
// Loipen-Allgäu: Detailseiten; Rohes HTML rund um "gespurt"
for (const name of ["Leutkirch", "Wangen", "Argenbuehl", "Isny%20/%20Maierhoefen", "Missen-Wilhams"]) {
  const { status, html } = await get(`http://www.loipen-allgaeu.de/loipen.php?name=${name}`);
  const t = text(html);
  const i = t.search(/gespurt|Schneeh/i);
  show(`LA ${name} ${status}`, t.slice(Math.max(0, i - 600), i + 1400));
  if (name === "Leutkirch") { const j = html.search(/gespurt/i); show("LA RAW", html.slice(Math.max(0, j - 2500), j + 1500)); }
}
{ const { status, html } = await get("https://www.leutkirch.de/de/Urlaub/Natur-Bewegung/Langlaufen/Loipenbericht");
  const t = text(html); const i = t.search(/Flutlicht-Loipe|Moosmühle/);
  show(`Leutkirch ${status}`, t.slice(Math.max(0, i - 800), i + 2500));
  const j = html.search(/Moosmühle/); show("Leutkirch RAW", html.slice(Math.max(0, j - 1500), j + 1500)); }
for (const url of ["https://www.sportpark-badwaldsee.de/loipen-info", "https://www.sg-niederwangen.de/sportarten/ski-langlauf/"]) {
  try { const { status, html } = await get(url); const t = text(html); const i = Math.max(0, t.search(/Loipe|gespurt|Stand/i) - 200);
    show(`${url} ${status}`, t.slice(i, i + 2000)); } catch (e) { show(url, e.message); }
}
