import { readFileSync } from "node:fs";
let src = readFileSync("radsport_test.js", "utf8");
let part = src.slice(src.indexOf("// ---------- Gesamtwertung aus Wikipedia"), src.indexOf("// Gesamtwertung, wenn der GC-Reiter auf der Seite leer ist:"));
globalThis.Request = class { constructor(u) { this.url = u; } async loadJSON() { return (await fetch(this.url, { headers: this.headers })).json(); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let women of [false, true]) {
  let fn = new Function("CONFIG", "WOMEN", "timeLeft", part + "; return wikiGC;")({ podium: 3 }, women, () => 99999);
  let races = women
    ? [{ name: "Tour of Guangxi", end: new Date(2026, 9, 18) }, { name: "Tour of Chongming Island", end: new Date(2026, 9, 11) }, { name: "La Vuelta Femenina", end: new Date(2026, 4, 10) }]
    : [{ name: "La Vuelta Ciclista a España", end: new Date(2026, 8, 13) }, { name: "Tour of Guangxi", end: new Date(2026, 9, 18) }, { name: "Giro d'Italia", end: new Date(2026, 4, 31) }];
  for (let race of races) {
    try { console.log(women ? "Frauen" : "Männer", race.name, "→", JSON.stringify(await fn(race))); }
    catch (e) { console.log(race.name, "Fehler", e.message); }
    await sleep(1500);
  }
}
