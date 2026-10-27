import { readFileSync } from "node:fs";
let src = readFileSync("radsport_test.js", "utf8");
let part = src.slice(src.indexOf("// ---------- Gesamtwertung aus Wikipedia"), src.indexOf("// Gesamtwertung, wenn der GC-Reiter auf der Seite leer ist:"));
globalThis.Request = class { constructor(u) { this.url = u; } async loadJSON() { return (await fetch(this.url)).json(); } };
const CONFIG = { podium: 3 };
const timeLeft = () => 99999;
for (let women of [false, true]) {
  let WOMEN = women;
  let fn = new Function("CONFIG", "WOMEN", "timeLeft", part + "; return wikiGC;")(CONFIG, WOMEN, timeLeft);
  for (let race of [
    { name: "La Vuelta Ciclista a España", end: new Date(2026, 8, 13) },
    { name: "Tour of Guangxi", end: new Date(2026, 9, 18) },
    { name: "Giro d'Italia", end: new Date(2026, 4, 31) },
    { name: "Tour de France", end: new Date(2026, 6, 26) },
    { name: "Tour de Romandie", end: new Date(2026, 4, 3) },
  ]) {
    try { console.log(women ? "Frauen" : "Männer", race.name, "→", JSON.stringify(await fn(race))); }
    catch (e) { console.log(race.name, "Fehler", e.message); }
  }
}
