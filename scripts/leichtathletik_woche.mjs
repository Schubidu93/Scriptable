// Beste Leichtathletik-Leistungen der letzten Tage, nach World-Athletics-Punkten ("Results Score").
// Läuft per GitHub Actions, durchsucht die Saison-Toplisten aller Disziplinen (tiefer als die All-Time-Listen)
// und schreibt die Top 5 für Frauen und Männer – weltweit und nur deutsche Athleten:
//   data/leichtathletik_woche.json, data/leichtathletik_woche_ger.json
// Das Widget Leichtathletik.js liest nur diese Dateien.

import { writeFile, mkdir } from "node:fs/promises";
import { EVENTS, CONCURRENCY, isoDate, parseDate, loadToplist, mapLimited } from "./wa_toplists.mjs";

const TOP = 5;
// Höchstens so viele Seiten (je 100 Zeilen) je Saisonliste
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
// Zeitraum fest 7 Tage (früher bei zu wenigen Leistungen auf 14/30/90 erweitert); sonst ggf. weniger als 5
const REGIONS = [
    { name: "Welt", query: "regionType=world", output: "data/leichtathletik_woche.json", windows: [7] },
    { name: "Deutschland", query: "regionType=countries&region=ger", output: "data/leichtathletik_woche_ger.json", windows: [7] },
];

// Ergebnisseite des Wettkampfs: Die Toplisten verlinken nur den Athleten. Der World-Athletics-Kalender kennt je
// Wettkampf eine ID (Ergebnisse unter /competition/calendar-results/results/<ID>) – zugeordnet über Datum und Ort.
const CALENDAR = "https://worldathletics.org/competition/calendar-results";

async function loadCalendar(from, to) {
    let events = [];
    for (let page = 1; page <= 10; page++) {
        let url = `${CALENDAR}?startDate=${isoDate(from)}&endDate=${isoDate(to)}&page=${page}`;
        let res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" } });
        if (res.status !== 200) break;
        let next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(await res.text());
        if (!next) break;
        let data = JSON.parse(next[1]).props.pageProps.initialEvents || {};
        let results = data.results || [];
        if (page === 1) console.log(`Kalender: ${results.length} Einträge auf Seite 1, gesamt ${data.hits ?? data.total ?? "?"} · Felder ${Object.keys(data).join(",")}`);
        events = events.concat(results);
        if (!results.length || (data.hits && events.length >= data.hits)) break;
    }
    return events.map(e => ({ id: e.id, name: e.name, venue: e.venue || "", start: e.startDate, end: e.endDate || e.startDate }));
}

// "Nemzeti Atlétikai Központ, Budapest (HUN)" → ["nemzeti atletikai kozpont", "budapest", "hun"]
const venueWords = v => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[,()]/).map(w => w.trim()).filter(Boolean);

function linkResults(list, calendar) {
    for (let r of list) {
        let date = isoDate(parseDate(r.date));
        let words = venueWords(r.venue);
        let candidates = calendar.filter(e => e.start <= date && date <= e.end);
        // Gleicher Ort: identisch, sonst Stadt und Land gleich
        let hit = candidates.find(e => venueWords(e.venue).join("|") === words.join("|"))
            || candidates.find(e => { let w = venueWords(e.venue); return w.slice(-2).join("|") === words.slice(-2).join("|"); });
        r.url = hit ? `${CALENDAR}/results/${hit.id}` : r.athlete || "";
        if (DEBUG_LINKS) console.log(`  Link ${r.name} ${r.venue} ${date}: ${hit ? hit.name : "kein Wettkampf"} → ${r.url}`);
    }
}
const DEBUG_LINKS = process.env.DEBUG === "1";

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
        .map((r, i) => ({ ...r, rank: i + 1 })); // eigener Rang, nicht der aus der Topliste
}

// Eine Region: alle Disziplinen laden, Top 5 bestimmen, Datei schreiben
async function collect(region, today) {
    let windows = region.windows;
    let maxFrom = new Date(today.getTime() - windows[windows.length - 1] * 86400000);
    let all = { women: [], men: [] };
    let stats = { ok: 0, empty: 0, failed: [] };

    // Einmal den größten Zeitraum laden, danach lokal auf die kürzeren Zeiträume filtern. Saison-Toplisten je Jahr:
    // reicht der Zeitraum ins Vorjahr (Januar), beide Jahre abfragen
    let years = [...new Set([maxFrom.getUTCFullYear(), today.getUTCFullYear()])];
    let jobs = EVENTS.women.map(ev => ["women", ev]).concat(EVENTS.men.map(ev => ["men", ev]))
        .flatMap(job => years.map(year => [...job, year]));
    let load = ([gender, ev, year], page) => {
        let from = year === maxFrom.getUTCFullYear() ? maxFrom : new Date(Date.UTC(year, 0, 1));
        let to = year === today.getUTCFullYear() ? today : new Date(Date.UTC(year, 11, 31));
        return loadToplist(gender, ev, { query: region.query, from, to, season: year, page });
    };
    let state = jobs.map(job => ({ job, gender: job[0], page: 1, last: null }));
    await mapLimited(state, CONCURRENCY, async st => { st.last = await load(st.job, 1); });
    for (let st of state) {
        let r = st.last;
        if (r.status !== 200) stats.failed.push(`${st.gender} ${r.label}: ${r.status}`);
        else if (r.rows.length) stats.ok++;
        else stats.empty++;
        all[st.gender] = all[st.gender].concat(r.rows);
    }

    // Weitere Seiten: Die Saisonlisten sind nach Leistung sortiert, aktuelle Ergebnisse stehen oft weiter hinten
    // (z. B. in ruhigen Wochen nach dem Saisonende). Eine Liste wird weiter geblättert, solange ihre letzte Seite
    // voll war und deren schwächste Leistung noch mehr Punkte hat als Platz 5 der bisherigen Auswahl – tiefer kann
    // sie nichts mehr verdrängen.
    let from7 = new Date(today.getTime() - windows[0] * 86400000);
    from7.setUTCHours(0, 0, 0, 0);
    let extra = 0;
    for (let page = 2; page <= MAX_PAGES; page++) {
        let bar = {};
        for (let gender of ["women", "men"]) {
            let list = best(all[gender], from7);
            bar[gender] = list.length >= TOP ? list[TOP - 1].score : 0;
        }
        let next = state.filter(st => st.last && st.last.status === 200 && st.last.rows.length >= PAGE_SIZE
            && Math.min(...st.last.rows.map(r => r.score || 0)) > bar[st.gender]);
        if (!next.length) break;
        await mapLimited(next, CONCURRENCY, async st => {
            st.page = page;
            st.last = await load(st.job, page);
            if (st.last.status === 200) all[st.gender] = all[st.gender].concat(st.last.rows);
        });
        extra += next.length;
    }
    console.log(`${region.name}: ${extra} weitere Seiten geladen`);

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

    // Leere Woche nur speichern, wenn die Listen auch geladen wurden (sonst Abruffehler – alten Stand behalten)
    try {
        let calendar = await loadCalendar(new Date(today.getTime() - (days + 1) * 86400000), today);
        linkResults(women.concat(men), calendar);
    } catch (e) {
        console.log(`Kalender für Links: ${e.message}`);
        women.concat(men).forEach(r => { r.url = r.athlete || ""; });
    }

    if (!women.length && !men.length && !stats.ok) {
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
