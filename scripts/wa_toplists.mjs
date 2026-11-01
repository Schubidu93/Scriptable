// Gemeinsame Bausteine für die World-Athletics-Toplisten (Abruf, Tabellen lesen, Disziplinen).
// Genutzt von leichtathletik_woche.mjs und leichtathletik_rekorde.mjs.

export const BASE = "https://worldathletics.org/records/all-time-toplists/";
// Saison-Toplisten: reichen tiefer als die All-Time-Listen (die enden bei einem hohen Leistungsniveau)
export const SEASON_BASE = "https://worldathletics.org/records/toplists/";
export const CONCURRENCY = 4;
export const DEBUG = process.env.DEBUG === "1";

// [Gruppe, Disziplin in der URL, Anzeige, Umgebung (Standard "all")] – nicht vorhandene Seiten werden übersprungen
export const EVENTS = {
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

export const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

export function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

export function cleanCell(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/\s+/g, " ")
        .trim();
}

// Länderkürzel aus Text, Bild-Attributen oder Flaggen-Dateinamen
export function natFromHtml(html) {
    let text = cleanCell(html);
    if (/^[A-Z]{3}$/.test(text)) return text;
    let attr = /(?:alt|title|data-[\w-]+)="([A-Z]{3})"/.exec(html);
    if (attr) return attr[1];
    let file = /flags?[^"']*?\/([a-z]{3})\.(?:svg|png|gif|jpe?g|webp)/i.exec(html);
    return file ? file[1].toUpperCase() : "";
}

// "27 SEP 2026" → Date
export function parseDate(text) {
    let m = /(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i.exec(text || "");
    return m && MONTHS[m[2].toUpperCase()] != null ? new Date(Date.UTC(Number(m[3]), MONTHS[m[2].toUpperCase()], Number(m[1]))) : null;
}

// Toplisten-Tabelle über die Spaltenüberschriften lesen
export function parseTable(html) {
    let table = (html.match(/<table[\s\S]*?<\/table>/gi) || []).find(t => /Competitor/i.test(t));
    if (!table) return { rows: [], headers: [] };
    let headers = (table.match(/<th[\s\S]*?<\/th>/gi) || []).map(h => cleanCell(h).toLowerCase());
    let col = name => headers.findIndex(h => h.startsWith(name));
    let idx = {
        rank: col("rank"), mark: col("mark"), wind: col("wind"), name: col("competitor"),
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
            rank: Number(get(idx.rank)) || 0,
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

export async function fetchPage(url) {
    let res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
}

// Eine Topliste laden.
//   query:     z. B. "regionType=world" oder "regionType=countries&region=ger"
//   from/to:   Zeitraum (ohne Angabe: alle Zeiten)
//   bestOnly:  nur die beste Leistung je Athlet
//   season:    Jahr – Saison-Topliste statt All-Time-Liste
export async function loadToplist(gender, [group, slug, label, env = "all"], { query, from, to, bestOnly = false, season }) {
    let range = from && to ? `&firstDay=${isoDate(from)}&lastDay=${isoDate(to)}` : "";
    let path = season ? `${SEASON_BASE}${group}/${slug}/${env}/${gender}/senior/${season}` : `${BASE}${group}/${slug}/${env}/${gender}/senior`;
    let url = `${path}?${query}&page=1&bestResultsOnly=${bestOnly}`
        + `${range}&maxResultsByCountry=all&ageCategory=senior`;
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
export async function mapLimited(items, limit, fn) {
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
