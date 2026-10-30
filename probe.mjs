const q = (lat, lon, r) => `[out:json][timeout:20];node["natural"="peak"]["name"](around:${r},${lat},${lon});out body;`;
for (const [name, lat, lon, r] of [["Kißlegg", 47.7886, 9.8809, 40000], ["Bayrischzell", 47.674, 12.013, 15000]]) {
  for (const ep of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    const t0 = Date.now();
    try {
      const r2 = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q(lat, lon, r)), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Scriptable-Gipfel-Widget" }, signal: AbortSignal.timeout(30000) });
      const j = await r2.json();
      console.log(name, ep, r2.status, (Date.now() - t0) + "ms", j.elements.length, JSON.stringify(j.elements.slice(0, 2)).slice(0, 400));
    } catch (e) { console.log(name, ep, "ERR", e.message, (Date.now() - t0) + "ms"); }
  }
}
