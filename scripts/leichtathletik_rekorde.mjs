// Rekorde und Bestleistungen der letzten Tage aus allen Disziplinen.
// Läuft täglich per GitHub Actions (nach leichtathletik_woche.mjs) und schreibt
// data/leichtathletik_highlights.json. Gesucht wird in vier Listen je Disziplin:
//   ewige Weltbestenliste, ewige deutsche Bestenliste, Welt-Jahresbestenliste, deutsche Jahresbestenliste
// Eine Leistung aus dem Zeitraum, die dort vorn steht, wird zum Höhepunkt – je Leistung zählt
// nur die bedeutendste Auszeichnung (Weltrekord vor Deutschem Rekord vor … ).

import { writeFile, mkdir } from "node:fs/promises";
import { EVENTS, CONCURRENCY, isoDate, parseDate, loadToplist, mapLimited } from "./wa_toplists.mjs";

const OUTPUT = "data/leichtathletik_highlights.json";
const WINDOWS = [7, 14, 30]; // Tage – ohne Höhepunkt wird der Zeitraum erweitert
const MAX_ITEMS = 8;

const WORLD = "regionType=world";
const GERMANY = "regionType=countries&region=ger";

// Liste → Auszeichnung je nach Rang (null = keine)
const RULES = [
    { list: "worldAll", rate: rank => rank === 1 ? { type: "WR", label: "Weltrekord", priority: 100 }
        : rank <= 10 ? { type: "AT", label: `Platz ${rank} aller Zeiten`, priority: 80 - rank } : null },
    { list: "gerAll", rate: rank => rank === 1 ? { type: "DR", label: "Deutscher Rekord", priority: 90 }
        : rank <= 10 ? { type: "DA", label: `Platz ${rank} der ewigen dt. Bestenliste`, priority: 60 - rank } : null },
    { list: "worldSeason", rate: rank => rank === 1 ? { type: "WL", label: "Weltjahresbestleistung", priority: 70 } : null },
    { list: "gerSeason", rate: rank => rank === 1 ? { type: "DL", label: "Deutsche Jahresbestleistung", priority: 45 }
        : rank <= 3 ? { type: "DT", label: `Platz ${rank} der dt. Jahresbestenliste`, priority: 40 - rank } : null },
];

async function loadLists(today) {
    let seasonStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    let lists = {
        worldAll: { query: WORLD, bestOnly: true },
        gerAll: { query: GERMANY, bestOnly: true },
        worldSeason: { query: WORLD, bestOnly: true, from: seasonStart, to: today },
        gerSeason: { query: GERMANY, bestOnly: true, from: seasonStart, to: today },
    };
    let jobs = [];
    for (let gender of ["women", "men"]) {
        for (let event of EVENTS[gender]) {
            for (let [list, options] of Object.entries(lists)) jobs.push({ gender, event, list, options });
        }
    }
    let results = await mapLimited(jobs, CONCURRENCY, async job => ({
        ...job,
        result: await loadToplist(job.gender, job.event, job.options),
    }));
    let failed = results.filter(r => r.result.status !== 200).length;
    console.log(`${results.length} Listen geladen, ${failed} Fehler`);
    return results;
}

function highlights(results, from) {
    let best = {};
    for (let { gender, list, result } of results) {
        let rule = RULES.find(r => r.list === list);
        for (let row of result.rows) {
            let date = parseDate(row.date);
            if (!date || date < from || !row.rank) continue;
            let award = rule.rate(row.rank);
            if (!award) continue;
            let key = `${gender}|${row.event}|${row.name}|${row.mark}|${row.date}`;
            if (best[key] && best[key].priority >= award.priority) continue;
            best[key] = { ...award, gender, event: row.event, name: row.name, nat: row.nat, mark: row.mark,
                wind: row.wind, venue: row.venue, date: row.date, score: row.score };
        }
    }
    return Object.values(best)
        .sort((a, b) => b.priority - a.priority || b.score - a.score)
        .slice(0, MAX_ITEMS);
}

async function main() {
    let today = new Date();
    let results = await loadLists(today);
    let days = WINDOWS[0], items = [];
    for (let window of WINDOWS) {
        days = window;
        let from = new Date(today.getTime() - window * 86400000);
        from.setUTCHours(0, 0, 0, 0);
        items = highlights(results, from);
        if (items.length) break;
    }
    console.log(`Zeitraum: ${days} Tage, ${items.length} Höhepunkte`);
    items.forEach(i => console.log(`  [${i.type}] ${i.label}: ${i.event} ${i.gender} ${i.mark} ${i.name} (${i.nat}) ${i.venue} ${i.date}`));

    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({
        generated: today.toISOString(),
        days,
        from: isoDate(new Date(today.getTime() - days * 86400000)),
        to: isoDate(today),
        items,
    }, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
