// Straßenentfernung Kißlegg → Loipen-Einstieg: Orte über Nominatim, Route über OSRM
const UA = { "User-Agent": "Scriptable-Langlauf-Widget/1.0 (github.com/Schubidu93/Scriptable)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const places = [
  ["kisslegg", "Rathaus Kißlegg"],
  ["vogt", "Vogt, Landkreis Ravensburg"],
  ["leutkirch", "Wilhelmshöhe, Leutkirch im Allgäu"],
  ["wangen", "Niederwangen, Wangen im Allgäu"],
  ["argenbuehl", "Eisenharz, Argenbühl"],
  ["isny", "Lohbauerstraße, Isny im Allgäu"],
  ["waldsee", "Hopfenweiler, Bad Waldsee"],
  ["heimenkirch", "Heimenkirch"],
  ["lindenberg", "Lindenberg im Allgäu"],
  ["scheidegg", "Scheidegg, Landkreis Lindau"],
  ["missen", "Missen-Wilhams"],
];
const coords = {};
for (const [id, q] of places) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(q)}`, { headers: UA });
  const j = await r.json();
  coords[id] = j[0] ? [Number(j[0].lon), Number(j[0].lat), j[0].display_name] : null;
  console.log(id, coords[id] ? `${coords[id][1].toFixed(4)},${coords[id][0].toFixed(4)} ${coords[id][2].slice(0, 70)}` : "NICHT GEFUNDEN");
  await sleep(1100);
}
const [x0, y0] = coords.kisslegg;
for (const [id] of places.slice(1)) {
  if (!coords[id]) continue;
  const [x, y] = coords[id];
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${x0},${y0};${x},${y}?overview=false`, { headers: UA });
  const j = await r.json();
  const route = j.routes && j.routes[0];
  console.log(`${id.padEnd(12)} ${route ? (route.distance / 1000).toFixed(1) + " km, " + Math.round(route.duration / 60) + " min" : JSON.stringify(j).slice(0, 100)}`);
  await sleep(500);
}
