// Rekorde und neue Einträge in den ewigen Top 10 – Welt, Europa und Deutschland, alle Disziplinen.
// Läuft täglich per GitHub Actions (nach leichtathletik_woche.mjs) und schreibt
// data/leichtathletik_highlights.json. Gelesen werden die ewigen Bestenlisten (beste Leistung je Athlet);
// jede Leistung auf Platz 1–10 zählt, Platz 1 ist der Rekord (WR, ER, DR).
// Angezeigt werden die 10 jüngsten Einträge – je Leistung mit der bedeutendsten Auszeichnung.

import { writeFile, mkdir } from "node:fs/promises";
import { EVENTS, CONCURRENCY, DEBUG, parseDate, loadToplist, mapLimited } from "./wa_toplists.mjs";

const OUTPUT = "data/leichtathletik_highlights.json";
const TOP = 10;           // ewige Top 10
const MAX_ITEMS = 10;     // angezeigte Einträge
const MAX_PER_EVENT = 2;  // je Disziplin und Geschlecht – sonst dominiert eine einzelne Veranstaltung
// Junge Disziplinen (z. B. Marathon Gehen seit 2026) haben keine „ewige“ Liste: Ist schon Platz 10
// jünger als das, wird die Liste übersprungen.
const MIN_LIST_AGE_DAYS = 3 * 365;

// Europa: die Abfrage wird beim ersten Lauf geprüft (nur europäische Nationen in der Liste)
const EUROPE_QUERIES = ["regionType=area&region=europe", "regionType=area&region=eur", "regionType=area&region=EUROPE"];
const NON_EUROPEAN = new Set(["USA", "JAM", "CAN", "KEN", "ETH", "BOT", "RSA", "CHN", "JPN", "AUS", "CUB", "BRA", "TTO", "BAH", "QAT", "NGR"]);

const SCOPES = [
    { key: "world", query: "regionType=world",
        rate: rank => rank === 1 ? { type: "WR", label: "Weltrekord", priority: 100 }
            : { type: "WT", label: `Platz ${rank} ewig Welt`, priority: 70 - rank } },
    { key: "europe", query: null,
        rate: rank => rank === 1 ? { type: "ER", label: "Europarekord", priority: 90 }
            : { type: "ET", label: `Platz ${rank} ewig Europa`, priority: 50 - rank } },
    { key: "germany", query: "regionType=countries&region=ger",
        rate: rank => rank === 1 ? { type: "DR", label: "Deutscher Rekord", priority: 80 }
            : { type: "DT", label: `Platz ${rank} ewig DE`, priority: 30 - rank } },
];

async function findEuropeQuery() {
    let probe = EVENTS.men.find(e => e[1] === "100-metres");
    for (let query of EUROPE_QUERIES) {
        let { status, rows } = await loadToplist("men", probe, { query, bestOnly: true });
        let nats = rows.slice(0, 20).map(r => r.nat);
        console.log(`Europa-Abfrage ${query}: HTTP ${status}, ${rows.length} Zeilen, Nationen ${nats.slice(0, 10).join(" ")}`);
        if (rows.length && nats.every(n => !NON_EUROPEAN.has(n))) return query;
    }
    console.log("::warning::Keine funktionierende Europa-Abfrage gefunden – Europa wird übersprungen.");
    return null;
}

async function loadLists() {
    let scopes = SCOPES.map(s => ({ ...s }));
    scopes.find(s => s.key === "europe").query = await findEuropeQuery();
    let jobs = [];
    for (let gender of ["women", "men"]) {
        for (let event of EVENTS[gender]) {
            for (let scope of scopes.filter(s => s.query)) jobs.push({ gender, event, scope });
        }
    }
    let results = await mapLimited(jobs, CONCURRENCY, async job => ({
        ...job,
        result: await loadToplist(job.gender, job.event, { query: job.scope.query, bestOnly: true }),
    }));
    let failed = results.filter(r => r.result.status !== 200);
    console.log(`${results.length} Listen geladen, ${failed.length} Fehler`);
    if (DEBUG) failed.forEach(r => console.log(`  Fehler ${r.scope.key} ${r.gender} ${r.event[2]}: ${r.result.status}`));
    return results;
}

// Alle Top-10-Leistungen; dieselbe Leistung in mehreren Listen → bedeutendste Auszeichnung zuerst
function entries(results, today) {
    let best = {};
    for (let { gender, scope, result } of results) {
        let top = result.rows.filter(r => r.rank >= 1 && r.rank <= TOP);
        let dates = top.map(r => parseDate(r.date)).filter(Boolean);
        if (top.length < TOP || Math.min(...dates) > today.getTime() - MIN_LIST_AGE_DAYS * 86400000) {
            if (DEBUG && top.length) console.log(`  übersprungen (junge Liste): ${scope.key} ${gender} ${result.label}`);
            continue;
        }
        for (let row of top) {
            let date = parseDate(row.date);
            if (!date) continue;
            let award = { ...scope.rate(row.rank), scope: scope.key, rank: row.rank };
            let key = `${gender}|${row.event}|${row.name}|${row.mark}|${row.date}`;
            let entry = best[key] || (best[key] = {
                gender, event: row.event, name: row.name, nat: row.nat, mark: row.mark,
                wind: row.wind, venue: row.venue, date: row.date, time: date.getTime(), score: row.score, awards: [],
            });
            entry.awards.push(award);
        }
    }
    return Object.values(best).map(e => {
        e.awards.sort((a, b) => b.priority - a.priority);
        let main = e.awards[0];
        // Weitere Rekorde mit nennen ("Europarekord · Deutscher Rekord"), sonst nur die Hauptauszeichnung
        let records = e.awards.filter(a => a.rank === 1);
        let label = records.length > 1 ? records.map(a => a.label).join(" · ") : main.label;
        let { awards, ...rest } = e;
        // Alle Auszeichnungen als Abzeichen, bedeutendste zuerst (z. B. EU 8 und DE 2)
        let badges = awards.map(a => ({ type: a.type, rank: a.rank }));
        return { type: main.type, label, priority: main.priority, rank: main.rank, records: records.map(a => a.type),
            badges, lists: awards.map(a => a.scope), ...rest };
    });
}

// Rekorde und Welt-Top-3 werden nie von der Grenze je Disziplin verdrängt
// (z. B. Assefa, Berlin-Marathon: Welt 2 – trotz zwei jüngerer Marathon-Einträge)
function outstanding(h) {
    return h.badges.some(b => b.rank === 1 || (b.type === "WT" && b.rank <= 3));
}

// Die jüngsten Einträge (bei gleichem Datum der bedeutendere zuerst), höchstens 2 je Disziplin –
// außer Rekorden und Welt-Top-3
function newest(list, count) {
    let perEvent = {};
    return list
        .slice()
        .sort((a, b) => b.time - a.time || b.priority - a.priority)
        .filter(h => {
            let key = `${h.gender}|${h.event}`;
            perEvent[key] = (perEvent[key] || 0) + 1;
            return perEvent[key] <= MAX_PER_EVENT || outstanding(h);
        })
        .slice(0, count)
        .map(({ time, ...h }) => h);
}

async function main() {
    let today = new Date();
    let results = await loadLists();
    let all = entries(results, today);
    let items = newest(all, MAX_ITEMS);
    // Zusätzlich je Bereich die 10 jüngsten Einträge seiner Liste
    let scopes = {};
    for (let scope of SCOPES) scopes[scope.key] = newest(all.filter(e => e.lists.includes(scope.key)), MAX_ITEMS);

    console.log(`${all.length} Top-10-Leistungen insgesamt, die ${items.length} jüngsten:`);
    items.forEach(i => console.log(`  [${i.type}] ${i.label}: ${i.event} ${i.gender} ${i.mark} ${i.name} (${i.nat}) ${i.venue} ${i.date}`));
    if (!items.length) {
        console.error("Keine Einträge gefunden – Datei bleibt unverändert.");
        process.exitCode = 1;
        return;
    }

    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({ generated: today.toISOString(), items, scopes }, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
