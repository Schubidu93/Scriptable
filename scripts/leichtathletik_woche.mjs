// Beste Leichtathletik-Leistungen der letzten Tage, nach World-Athletics-Punkten ("Results Score").
// Läuft täglich per GitHub Actions, durchsucht die All-Time-Toplisten aller Disziplinen
// und schreibt die Top 5 für Frauen und Männer – weltweit und nur deutsche Athleten:
//   data/leichtathletik_woche.json, data/leichtathletik_woche_ger.json
// Das Widget Leichtathletik.js liest nur diese Dateien.

import { writeFile, mkdir } from "node:fs/promises";
import { EVENTS, CONCURRENCY, isoDate, parseDate, loadToplist, mapLimited } from "./wa_toplists.mjs";

const TOP = 5;
// Reicht eine Woche nicht für 5 Leistungen, wird der Zeitraum erweitert (Tage)
const REGIONS = [
    { name: "Welt", query: "regionType=world", output: "data/leichtathletik_woche.json", windows: [7, 14, 30] },
    { name: "Deutschland", query: "regionType=countries&region=ger", output: "data/leichtathletik_woche_ger.json", windows: [7, 14, 30, 90] },
];

function best(rows, from) {
    let seen = new Set();
    return rows
        .filter(r => r.score > 0 && parseDate(r.date) && parseDate(r.date) >= from)
        .sort((a, b) => b.score - a.score)
        .filter(r => {
            let key = `${r.name}|${r.event}|${r.date}|${r.mark}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, TOP)
        .map((r, i) => ({ rank: i + 1, ...r }));
}

// Eine Region: alle Disziplinen laden, Top 5 bestimmen, Datei schreiben
async function collect(region, today) {
    let windows = region.windows;
    let maxFrom = new Date(today.getTime() - windows[windows.length - 1] * 86400000);
    let all = { women: [], men: [] };
    let stats = { ok: 0, empty: 0, failed: [] };

    // Einmal den größten Zeitraum laden, danach lokal auf die kürzeren Zeiträume filtern
    for (let gender of ["women", "men"]) {
        let results = await mapLimited(EVENTS[gender], CONCURRENCY, ev => loadToplist(gender, ev, { query: region.query, from: maxFrom, to: today }));
        for (let r of results) {
            if (r.status !== 200) stats.failed.push(`${gender} ${r.label}: ${r.status}`);
            else if (r.rows.length) stats.ok++;
            else stats.empty++;
            all[gender] = all[gender].concat(r.rows);
        }
    }

    let days = windows[0], women = [], men = [];
    for (let window of windows) {
        days = window;
        let from = new Date(today.getTime() - window * 86400000);
        from.setUTCHours(0, 0, 0, 0);
        women = best(all.women, from);
        men = best(all.men, from);
        if (women.length >= TOP && men.length >= TOP) break;
    }

    console.log(`== ${region.name}: Seiten mit Ergebnissen ${stats.ok}, ohne ${stats.empty}, Fehler ${stats.failed.length}`);
    stats.failed.forEach(f => console.log(`  Fehler ${f}`));
    console.log(`Zeitraum: ${days} Tage`);
    for (let [title, list] of [["Frauen", women], ["Männer", men]]) {
        console.log(title);
        list.forEach(r => console.log(`  ${r.rank}. ${r.score} ${r.event} ${r.mark} ${r.name} (${r.nat}) ${r.venue} ${r.date}`));
    }

    if (!women.length && !men.length) {
        console.error(`${region.name}: keine Ergebnisse gefunden – Datei bleibt unverändert.`);
        return false;
    }
    await mkdir("data", { recursive: true });
    await writeFile(region.output, JSON.stringify({
        generated: today.toISOString(),
        region: region.name,
        days,
        from: isoDate(new Date(today.getTime() - days * 86400000)),
        to: isoDate(today),
        women,
        men,
    }, null, 2) + "\n");
    console.log(`Geschrieben: ${region.output}`);
    return true;
}

async function main() {
    let today = new Date();
    // Fehlschlag nur, wenn keine Region Ergebnisse hat – sonst wird gespeichert, was da ist
    let written = 0;
    for (let region of REGIONS) {
        if (await collect(region, today)) written++;
    }
    if (!written) process.exitCode = 1;
}

main();
