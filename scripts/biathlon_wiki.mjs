// Biathlon-Weltcup aus der deutschen Wikipedia (Saisonseite "Biathlon-Weltcup 2026/27"): die letzten Rennen mit
// Podium, die nächsten Rennen bzw. Stationen und der Gesamtweltcup – data/biathlon.json für Biathlon.js.
// Ersatz für die IBU-Schnittstelle, die seit November 2026 eine Anmeldung verlangt (401). Läuft stündlich.

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Scriptable-Biathlon-Widget/1.0 (github.com/Schubidu93/Scriptable)";
const PAST = 3, UPCOMING = 3, PODIUM = 3, GERMANS = 3;

// Länder-Vorlagen der Wikipedia (meist ISO-3) → IOC-Kürzel wie bei der IBU
const ISO_TO_IOC = { DEU: "GER", CHE: "SUI", SVN: "SLO", NLD: "NED", LVA: "LAT", BGR: "BUL", HRV: "CRO", GRC: "GRE",
    DNK: "DEN", PRT: "POR", MNG: "MGL", BIH: "BIH" };
const ioc = code => ISO_TO_IOC[code] || code;
const NATION_NAMES = { NOR: "Norwegen", FRA: "Frankreich", SWE: "Schweden", GER: "Deutschland", ITA: "Italien", AUT: "Österreich",
    SUI: "Schweiz", USA: "USA", CZE: "Tschechien", FIN: "Finnland", UKR: "Ukraine", SLO: "Slowenien", BUL: "Bulgarien",
    EST: "Estland", CAN: "Kanada", POL: "Polen", SVK: "Slowakei", LAT: "Lettland", LTU: "Litauen", KAZ: "Kasachstan",
    BEL: "Belgien", JPN: "Japan", CHN: "China" };
// Doppelnamen, bei denen der letzte Teil allein falsch wäre
const SURNAMES = ["Fillon Maillet", "Holm Lægreid", "Sjåstad Christiansen", "Leknes Frey", "Dale-Skjevdal"];

const MONTHS = { januar: 0, februar: 1, "märz": 2, april: 3, mai: 4, juni: 5, juli: 6, august: 7, september: 8,
    oktober: 9, november: 10, dezember: 11 };

async function wikitext(title) {
    let url = `https://de.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2`;
    let res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (res.status !== 200) throw new Error(`${title}: HTTP ${res.status}`);
    let json = await res.json();
    if (json.error) throw new Error(`${title}: ${json.error.info}`);
    return json.parse.wikitext;
}

// "Éric Perrot" → "É. Perrot", "Quentin Fillon Maillet" → "Q. Fillon Maillet"
function shortName(full) {
    let name = String(full).replace(/\s*\(.*?\)\s*$/, "").trim();
    let surname = SURNAMES.find(s => name.endsWith(" " + s)) || name.split(" ").pop();
    let first = name.slice(0, name.length - surname.length).trim();
    return first ? `${first.charAt(0)}. ${surname}` : surname;
}

// {{NOR|Ziel=Johan-Olav Botn}} / {{CZE|Nové Město na Moravě|Nové Město}} → { nat, name }
function country(tpl) {
    let m = /\{\{([A-Z]{3})((?:\|[^{}]*)?)\}\}/.exec(tpl || "");
    if (!m) return null;
    let params = m[2].split("|").slice(1).map(p => p.trim()).filter(Boolean);
    let target = params.find(p => p.startsWith("Ziel="));
    let name = target ? target.slice(5) : params.length > 1 ? params[1] : params[0] || "";
    return { nat: ioc(m[1]), name: name.replace(/\[\[|\]\]/g, "") };
}

const DISCIPLINES = [[/single.?mixed/i, "Single-Mixed"], [/mixed/i, "Mixed-Staffel"], [/staffel/i, "Staffel"],
    [/kurz.?einzel/i, "Kurzeinzel"], [/einzel/i, "Einzel"], [/massenstart/i, "Massenstart"], [/verfolgung/i, "Verfolgung"],
    [/sprint/i, "Sprint"]];

// "Staffel (4 × 7,5 km)" → "Staffel 4×7,5 km", "Sprint (10 km)" → "Sprint 10 km"
function discipline(text) {
    let found = DISCIPLINES.find(([re]) => re.test(text));
    let name = found ? found[1] : text.replace(/\s*\(.*\)/, "");
    let dist = /\(([^)]*km)\)/.exec(text);
    return dist ? `${name} ${dist[1].replace(/\s*×\s*/, "×")}` : name;
}

// "29. November 2025 (Sa.)" → Date (12 Uhr, Uhrzeit unbekannt)
function parseDay(text) {
    let m = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/.exec(text || "");
    if (!m || MONTHS[m[2].toLowerCase()] === undefined) return null;
    return new Date(Date.UTC(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), 11));
}

function section(text, startRe, endRe) {
    let m = startRe.exec(text);
    if (!m) return "";
    let rest = text.slice(m.index + m[0].length);
    let e = endRe.exec(rest);
    return e ? rest.slice(0, e.index) : rest;
}

// Rennen eines Geschlechts aus "Resultate und Kalender": je Station ein {| {{Wettkampfergebnis|Titel=…}} … |}
function parseRaces(genderText) {
    let block = section(genderText, /^=== Resultate und Kalender ===/m, /^=== /m);
    let races = [];
    for (let table of block.split(/\{\|\s*\{\{Wettkampfergebnis/).slice(1)) {
        let title = (/Titel=([^\n]*)/.exec(table) || [])[1] || "";
        let station = country(title) || { nat: "", name: "" };
        // "{{FRA|Ziel=Annecy}}-[[Le Grand-Bornand]]" → Le Grand-Bornand
        let after = /\}\}-\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/.exec(title);
        if (after) station.name = after[1];
        let type = /weltmeisterschaft/i.test(title) ? "WM" : /olymp/i.test(title) ? "Olympia" : "Weltcup";
        for (let row of table.split(/\n\|-/).slice(1)) {
            let cells = row.split("\n").map(l => l.replace(/^\|\s?/, "").trim()).filter(l => l && !l.startsWith("}"));
            let date = parseDay(cells[0]);
            if (!date || !cells[1]) continue;
            let podium = cells.slice(2, 2 + PODIUM).map(c => {
                if (/\{\{Staffel/i.test(c)) {
                    let nat = ioc((/\{\{Staffel\|\{\{([A-Z]{3})\}\}/.exec(c) || [])[1] || "");
                    return { name: NATION_NAMES[nat] || nat, nat, time: "" };
                }
                let p = country(c);
                return p && p.name ? { name: shortName(p.name), nat: p.nat, time: "" } : null;
            }).filter(Boolean);
            races.push({ id: `${date.toISOString().slice(0, 10)}-${cells[1]}`, name: discipline(cells[1]), start: date.toISOString(),
                place: station.name, nat: station.nat, type, podium });
        }
    }
    return races;
}

// Gesamtweltcup aus "Ergebnisse Athleten/Athletinnen": alle mit Punkten (Wikipedia zeigt oben nur die Top 10)
function parseStandings(genderText) {
    let block = section(genderText, /^==== Ergebnisse Athlet(en|innen) ====/m, /^=+ /m);
    let rows = [];
    for (let row of block.split(/\n\|-/)) {
        let rank = /^\s*!\s*(\d+)\s*$/m.exec(row);
        let person = country((/\{\{[A-Z]{3}\|[^{}]*Ziel=[^{}]*\}\}/.exec(row) || [])[0]);
        let cells = row.trim().split("\n").filter(l => l.startsWith("|"));
        let score = Number(((cells[cells.length - 1] || "").match(/(\d+)\s*$/) || [])[1]);
        if (rank && person && score) rows.push({ rank: Number(rank[1]), name: shortName(person.name), nat: person.nat, score });
    }
    rows.sort((a, b) => a.rank - b.rank);
    return {
        top: rows.slice(0, PODIUM),
        germans: rows.filter(r => r.nat === "GER" && r.rank > PODIUM).slice(0, GERMANS),
        bestGermans: rows.filter(r => r.nat === "GER").slice(0, GERMANS),
        nations: [],
        count: rows.length,
    };
}

// Stationen aus dem Wettkampfkalender (für die nächsten Rennen, solange einzelne Termine fehlen)
const MARKS = ["Einzel", "Sprint", "Verfolgung", "Massenstart", "Staffel", "Mixed-Staffel", "Single-Mixed"];

function parseStations(text, startYear) {
    let block = section(text, /^=== Wettkampfkalender ===/m, /^=== /m);
    let table = block.slice(block.indexOf("{| class=\"wikitable"));
    let stations = [];
    for (let row of table.split(/\n\|-/).slice(1)) {
        let lines = row.split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && !l.startsWith("|}"));
        let cell = l => l.replace(/^\|\s*(style="[^"]*"\s*\|)?\s*/, "").trim();
        if (lines.length < 5 || !/^\d+$/.test(cell(lines[0]))) continue;
        // "24.–29. November", "31. Dezember – 3. Januar"
        let dateText = cell(lines[1]);
        let parts = [...dateText.matchAll(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)?/g)];
        let endMonth = MONTHS[(parts[parts.length - 1][2] || "").toLowerCase()];
        let startMonth = parts[0][2] ? MONTHS[parts[0][2].toLowerCase()] : endMonth;
        if (endMonth === undefined || startMonth === undefined) continue;
        let year = m => (m >= 6 ? startYear : startYear + 1);
        let start = new Date(Date.UTC(year(startMonth), startMonth, Number(parts[0][1]), 8));
        let end = new Date(Date.UTC(year(endMonth), endMonth, Number(parts[parts.length - 1][1]), 20));
        let nat = ioc((/\{\{([A-Z]{3})\}\}/.exec(cell(lines[2])) || [])[1] || "");
        let place = cell(lines[3]).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
        let kinds = lines.slice(5, 5 + MARKS.length).map((l, i) => (/●/.test(l) ? MARKS[i] : null)).filter(Boolean)
            .filter(k => !/Mixed/.test(k));
        stations.push({ id: `station-${start.toISOString().slice(0, 10)}`, name: kinds.join(", ") || "Weltcup", start: start.toISOString(),
            end: end.toISOString(), place, nat, type: "Weltcup", station: true });
    }
    return stations;
}

function genderPart(text, gender) {
    return section(text, gender === "men" ? /^== Männer ==/m : /^== Frauen ==/m, /^== /m);
}

async function main() {
    let now = new Date();
    let startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    let season = `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
    let title = y => `Biathlon-Weltcup ${y}/${String(y + 1).slice(2)}`;
    let current = await wikitext(title(startYear));
    let previous = await wikitext(title(startYear - 1)).catch(e => { console.log(e.message); return ""; });

    let races = {}, cup = { season, final: false };
    for (let gender of ["men", "women"]) {
        let cur = parseRaces(genderPart(current, gender));
        let done = cur.filter(r => r.podium.length);
        // Saisonanfang: die letzten Rennen der Vorsaison ergänzen
        if (done.length < PAST) done = parseRaces(genderPart(previous, gender)).filter(r => r.podium.length).concat(done);
        let past = done.sort((a, b) => b.start.localeCompare(a.start)).slice(0, PAST);
        // Nächste Rennen: geplante Einzeltermine (ohne Podium), sonst die nächsten Stationen
        let planned = cur.filter(r => !r.podium.length && new Date(r.start) >= new Date(now.getTime() - 12 * 3600000));
        let upcoming = planned.length ? planned : parseStations(current, startYear).filter(s => new Date(s.end) >= now);
        upcoming.sort((a, b) => a.start.localeCompare(b.start));
        races[gender] = { past, upcoming: upcoming.slice(0, UPCOMING) };
        cup[gender] = parseStandings(genderPart(current, gender));
    }
    // Vor dem ersten Rennen: Endstand der Vorsaison
    if (!cup.men.count && !cup.women.count && previous) {
        cup = { season: `${String(startYear - 1).slice(2)}${String(startYear).slice(2)}`, final: true,
            men: parseStandings(genderPart(previous, "men")), women: parseStandings(genderPart(previous, "women")) };
    }
    let data = { generated: now.toISOString(), source: "Wikipedia", races, cup };
    console.log(JSON.stringify(data, null, 1).slice(0, 4000));
    if (!races.men.past.length && !races.women.past.length && !cup.men.count) throw new Error("nichts gefunden – alter Stand bleibt");
    await mkdir("data", { recursive: true });
    await writeFile("data/biathlon.json", JSON.stringify(data, null, 1) + "\n");
}

main().catch(e => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 1;
});
