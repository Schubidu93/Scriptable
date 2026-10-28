const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const base = "https://www.bayrischzell.de";
const html = await (await fetch(base + "/schneebericht", { headers: UA })).text();
const idents = [...html.matchAll(/id="(address_\d+)_CrossCountry"[^>]*data-block-ident="(address_\d+)"/g)].map(m => m[2]);
const titles = [...html.matchAll(/Langlaufen in ([^<\n]+)/g)].map(m => m[1].trim());
console.log("IDENTS", idents.length, idents.join(","), titles.join(","));
const strip = s => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
for (let k = 0; k < idents.length; k++) {
  const u = `${base}/de/action/module_placeholder?blockType=${encodeURIComponent("body\\snowReport\\CrossCountryMapListBlock")}&blockIdent=${idents[k]}`;
  try {
    const r = await fetch(u, { headers: { ...UA, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    console.log(`\n### ${titles[k]} ${idents[k]} ${r.status} len=${t.length}`);
    console.log(strip(t).slice(0, 1500));
    if (k === 0) console.log("RAW:", t.slice(0, 3000));
  } catch (e) { console.log(titles[k], "ERR", e.message); }
}
// Straßenkilometer ab Marienplatz
const P = { muenchen: [11.5755, 48.1374], holzkirchen: [11.6966, 47.8846], warngau: [11.7270, 47.8350], waakirchen: [11.6730, 47.7720],
  gmund: [11.7370, 47.7500], hausham: [11.8410, 47.7470], badwiessee: [11.7210, 47.7160], schliersee: [11.8600, 47.7360],
  rottach: [11.7700, 47.6890], fischbachau: [11.9520, 47.7180], kreuth: [11.7470, 47.6420], bayrischzell: [12.0130, 47.6740],
  lenggries: [11.5740, 47.6800], jachenau: [11.4350, 47.6060], oberpframmern: [11.8130, 48.0230], baierbrunn: [11.4870, 48.0200],
  weyarn: [11.7990, 47.8580], glonn: [11.8640, 47.9890], feldkirchen: [11.8460, 47.9070], woerthsee: [11.2050, 48.0700], tutzing: [11.2800, 47.9070] };
const keys = Object.keys(P);
const url = `https://router.project-osrm.org/table/v1/driving/${keys.map(k => P[k].join(",")).join(";")}?sources=0&annotations=distance,duration`;
try {
  const j = await (await fetch(url, { headers: { "User-Agent": "scriptable-langlauf-probe" }, signal: AbortSignal.timeout(30000) })).json();
  keys.forEach((k, i) => console.log("DIST", k, (j.distances[0][i] / 1000).toFixed(1), "km", Math.round(j.durations[0][i] / 60), "min"));
} catch (e) { console.log("OSRM ERR", e.message); }
