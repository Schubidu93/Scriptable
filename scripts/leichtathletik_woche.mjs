// Beste Leichtathletik-Leistungen der letzten Tage, nach World-Athletics-Punkten ("Results Score").
// Läuft täglich per GitHub Actions, durchsucht die All-Time-Toplisten aller Disziplinen
// und schreibt die Top 5 für Frauen und Männer nach data/leichtathletik_woche.json.
// Das Widget Leichtathletik.js liest nur diese Datei.

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://worldathletics.org/records/all-time-toplists/";
const OUTPUT = "data/leichtathletik_woche.json";
const TOP = 5;
const WINDOWS = [7, 14, 30]; // Tage – reicht eine Woche nicht für 5 Leistungen, wird erweitert
const CONCURRENCY = 4;
const DEBUG = process.env.DEBUG === "1";

// [Gruppe, Disziplin in der URL, Anzeige, Umgebung (Standard "all")] – nicht vorhandene Seiten werden übersprungen
const EVENTS = {
    women: [
        ["sprints", "60-metres", "60 m"], ["sprints", "100-metres", "100 m"], ["sprints", "200-metres", "200 m"],
        ["sprints", "400-metres", "400 m"], ["middlelong", "800-metres", "800 m"], ["middlelong", "1500-metres", "1500 m"],
        ["middlelong", "one-mile", "Meile"], ["middlelong", "3000-metres", "3000 m"], ["middlelong", "5000-metres", "5000 m"],
        ["middlelong", "10000-metres", "10.000 m"], ["hurdles", "60-metres-hurdles", "60 m Hürden"],
        ["hurdles", "100-metres-hurdles", "100 m Hürden"], ["hurdles", "400-metres-hurdles", "400 m Hürden"],
        ["middlelong", "3000-metres-steeplechase", "3000 m Hindernis"], ["jumps", "high-jump", "Hochsprung"],
        ["jumps", "pole-vault", "Stabhochsprung"], ["jumps", "long-jump", "Weitsprung"], ["jumps", "triple-jump", "Dreisprung"],
        ["throws", "shot-put", "Kugelstoßen"], ["throws", "discus-throw", "Diskuswurf"], ["throws", "hammer-throw", "Hammerwurf"],
        ["throws", "javelin-throw", "Speerwurf"], ["combined-events", "heptathlon", "Siebenkampf"],
        ["combined-events", "pentathlon", "Fünfkampf", "indoor"], ["road-running", "10-kilometres", "10 km"],
        ["road-running", "half-marathon", "Halbmarathon"], ["road-running", "marathon", "Marathon"],
        ["race-walks", "20-kilometres-race-walk", "20 km Gehen"], ["race-walks", "35-kilometres-race-walk", "35 km Gehen"],
        ["race-walks", "half-marathon-race-walk", "Halbmarathon Gehen"], ["race-walks", "marathon-race-walk", "Marathon Gehen"],
    ],
    men: [
        ["sprints", "60-metres", "60 m"], ["sprints", "100-metres", "100 m"], ["sprints", "200-metres", "200 m"],
        ["sprints", "400-metres", "400 m"], ["middlelong", "800-metres", "800 m"], ["middlelong", "1500-metres", "1500 m"],
        ["middlelong", "one-mile", "Meile"], ["middlelong", "3000-metres", "3000 m"], ["middlelong", "5000-metres", "5000 m"],
        ["middlelong", "10000-metres", "10.000 m"], ["hurdles", "60-metres-hurdles", "60 m Hürden"],
        ["hurdles", "110-metres-hurdles", "110 m Hürden"], ["hurdles", "400-metres-hurdles", "400 m Hürden"],
        ["middlelong", "3000-metres-steeplechase", "3000 m Hindernis"], ["jumps", "high-jump", "Hochsprung"],
        ["jumps", "pole-vault", "Stabhochsprung"], ["jumps", "long-jump", "Weitsprung"], ["jumps", "triple-jump", "Dreisprung"],
        ["throws", "shot-put", "Kugelstoßen"], ["throws", "discus-throw", "Diskuswurf"], ["throws", "hammer-throw", "Hammerwurf"],
        ["throws", "javelin-throw", "Speerwurf"], ["combined-events", "decathlon", "Zehnkampf"],
        ["road-running", "10-kilometres", "10 km"],
        ["road-running", "half-marathon", "Halbmarathon"], ["road-running", "marathon", "Marathon"],
        ["race-walks", "20-kilometres-race-walk", "20 km Gehen"], ["race-walks", "35-kilometres-race-walk", "35 km Gehen"],
        ["race-walks", "half-marathon-race-walk", "Halbmarathon Gehen"], ["race-walks", "marathon-race-walk", "Marathon Gehen"],
    ],
};

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function cleanCell(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/\s+/g, " ")
        .trim();
}

// Länderkürzel aus Text, Bild-Attributen oder Flaggen-Dateinamen
function natFromHtml(html) {
    let text = cleanCell(html);
    if (/^[A-Z]{3}$/.test(text)) return text;
    let attr = /(?:alt|title|data-[\w-]+)="([A-Z]{3})"/.exec(html);
    if (attr) return attr[1];
    let file = /flags?[^"']*?\/([a-z]{3})\.(?:svg|png|gif|jpe?g|webp)/i.exec(html);
    return file ? file[1].toUpperCase() : "";
}

// "27 SEP 2026" → Date
function parseDate(text) {
    let m = /(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i.exec(text || "");
    return m && MONTHS[m[2].toUpperCase()] != null ? new Date(Date.UTC(Number(m[3]), MONTHS[m[2].toUpperCase()], Number(m[1]))) : null;
}

// Toplisten-Tabelle über die Spaltenüberschriften lesen
function parseTable(html) {
    let table = (html.match(/<table[\s\S]*?<\/table>/gi) || []).find(t => /Competitor/i.test(t));
    if (!table) return { rows: [], headers: [] };
    let headers = (table.match(/<th[\s\S]*?<\/th>/gi) || []).map(h => cleanCell(h).toLowerCase());
    let col = name => headers.findIndex(h => h.startsWith(name));
    let idx = {
        mark: col("mark"), wind: col("wind"), name: col("competitor"),
        nat: col("nat") >= 0 ? col("nat") : col("country") >= 0 ? col("country") : col("dob") >= 0 ? col("dob") + 1 : -1,
        venue: col("venue"), date: col("date"), score: headers.findIndex(h => h.includes("score")),
    };
    let body = (table.match(/<tbody[\s\S]*?<\/tbody>/i) || [table])[0];
    let rows = (body.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(row => {
        let raw = row.match(/<td[\s\S]*?<\/td>/gi) || [];
        let cells = raw.map(cleanCell);
        let get = i => (i >= 0 && i < cells.length ? cells[i] : "");
        if (DEBUG && !parseTable.shown && raw.length > 5) {
            parseTable.shown = true;
            console.log(`Beispiel Nationalität (HTML): ${(raw[idx.nat] || "").replace(/\s+/g, " ").slice(0, 400)}`);
        }
        let nat = idx.nat >= 0 && raw[idx.nat] ? natFromHtml(raw[idx.nat]) : "";
        if (!nat) nat = (cells.find((c, i) => i !== idx.mark && /^[A-Z]{3}$/.test(c)) || "");
        return {
            mark: get(idx.mark),
            wind: get(idx.wind),
            name: get(idx.name),
            nat,
            venue: get(idx.venue),
            date: get(idx.date),
            score: Number(get(idx.score).replace(/[^\d.]/g, "")) || 0,
        };
    }).filter(r => r.mark && r.name);
    return { rows, headers };
}

async function fetchPage(url) {
    let res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
}

async function loadEvent(gender, [group, slug, label, env = "all"], from, to) {
    let url = `${BASE}${group}/${slug}/${env}/${gender}/senior?regionType=world&page=1&bestResultsOnly=false`
        + `&firstDay=${isoDate(from)}&lastDay=${isoDate(to)}&maxResultsByCountry=all&ageCategory=senior`;
    try {
        let { status, html } = await fetchPage(url);
        if (status !== 200) return { label, status, rows: [] };
        let { rows, headers } = parseTable(html);
        if (!rows.length && /<table/i.test(html) === false) {
            await new Promise(r => setTimeout(r, 1500));
            ({ status, html } = await fetchPage(url));
            ({ rows, headers } = parseTable(html));
        }
        if (DEBUG && !rows.length) {
            let title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || ["", ""])[1].trim();
            let tables = (html.match(/<table/gi) || []).length;
            let note = /no results|keine/i.test(html) ? " · Hinweis 'no results'" : "";
            console.log(`  ${gender} ${label}: leer · Titel "${title}" · ${tables} Tabellen · ${html.length} Zeichen${note}`);
        }
        if (DEBUG && rows.length) console.log(`  ${gender} ${label}: Spalten ${headers.join(" | ")} · Beispiel ${JSON.stringify(rows[0])}`);
        return { label, status, rows: rows.map(r => ({ ...r, event: label })) };
    } catch (e) {
        return { label, status: String(e), rows: [] };
    }
}

// Mehrere Abrufe gleichzeitig, aber begrenzt
async function mapLimited(items, limit, fn) {
    let results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: limit }, async () => {
        while (next < items.length) {
            let i = next++;
            results[i] = await fn(items[i]);
        }
    }));
    return results;
}

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

async function main() {
    let today = new Date();
    let maxFrom = new Date(today.getTime() - WINDOWS[WINDOWS.length - 1] * 86400000);
    let all = { women: [], men: [] };
    let stats = { ok: 0, empty: 0, failed: [] };

    // Einmal den größten Zeitraum laden, danach lokal auf 7/14/30 Tage filtern
    for (let gender of ["women", "men"]) {
        let results = await mapLimited(EVENTS[gender], CONCURRENCY, ev => loadEvent(gender, ev, maxFrom, today));
        for (let r of results) {
            if (r.status !== 200) stats.failed.push(`${gender} ${r.label}: ${r.status}`);
            else if (r.rows.length) stats.ok++;
            else stats.empty++;
            all[gender] = all[gender].concat(r.rows);
        }
    }

    let days = WINDOWS[0], women = [], men = [];
    for (let window of WINDOWS) {
        days = window;
        let from = new Date(today.getTime() - window * 86400000);
        from.setUTCHours(0, 0, 0, 0);
        women = best(all.women, from);
        men = best(all.men, from);
        if (women.length >= TOP && men.length >= TOP) break;
    }

    console.log(`Seiten mit Ergebnissen: ${stats.ok}, ohne: ${stats.empty}, Fehler: ${stats.failed.length}`);
    stats.failed.forEach(f => console.log(`  Fehler ${f}`));
    console.log(`Zeitraum: ${days} Tage`);
    for (let [title, list] of [["Frauen", women], ["Männer", men]]) {
        console.log(title);
        list.forEach(r => console.log(`  ${r.rank}. ${r.score} ${r.event} ${r.mark} ${r.name} (${r.nat}) ${r.venue} ${r.date}`));
    }

    if (!women.length && !men.length) {
        console.error("Keine Ergebnisse gefunden – Datei bleibt unverändert.");
        process.exitCode = 1;
        return;
    }
    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({
        generated: today.toISOString(),
        days,
        from: isoDate(new Date(today.getTime() - days * 86400000)),
        to: isoDate(today),
        women,
        men,
    }, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
