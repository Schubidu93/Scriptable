import { readFileSync } from "node:fs";
const src = readFileSync("Gipfel.js", "utf8");
// Scriptable-Request nachbilden
globalThis.config = { runsInWidget: false };
globalThis.Request = class { constructor(u) { this.url = u; } async loadJSON() { const r = await fetch(this.url, { headers: this.headers }); return r.json(); } };
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = [pick("const PEAK_TYPES", "async function wikidata"), pick("async function wikidata", "// Namenlose Höhenpunkte"), pick("const isSpotHeight", "// \"1838\"")].join("\n");
const fn = new Function("config", "Request", code + "; return { wikidata, usable };");
const { wikidata, usable } = fn(globalThis.config, globalThis.Request);
const here = { lat: 47.7886, lon: 9.8809, alt: 653 };
const t0 = Date.now();
const list = await wikidata(here, 40000, true);
const rad = x => x * Math.PI / 180;
const km = p => { const h = Math.sin(rad(p.lat - here.lat) / 2) ** 2 + Math.cos(rad(here.lat)) * Math.cos(rad(p.lat)) * Math.sin(rad(p.lon - here.lon) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const notable = list.filter(usable).filter(p => p.ele && p.ele - here.alt >= 200).filter(p => p.isolation >= 2000).map(p => ({ ...p, km: km(p) })).sort((a, b) => a.km - b.km).slice(0, 8);
console.log("ms", Date.now() - t0, "Hochberg-Einträge", list.filter(p => p.name === "Hochberg").map(p => `${p.ele}m iso ${p.isolation}`).join(" / "));
console.log("TOP8", notable.map(p => `${p.name} ${p.ele}m ${p.km.toFixed(1)}km iso${p.isolation} ${p.wiki ? "wiki" : "-"}`).join(" | "));
