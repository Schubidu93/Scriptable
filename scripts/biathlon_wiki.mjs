// Biathlon-Weltcup aus der deutschen Wikipedia (Saisonseite "Biathlon-Weltcup 2026/27"): die letzten Rennen mit
// Podium, die nächsten Rennen bzw. Stationen und der Gesamtweltcup – data/biathlon.json für Biathlon.js.
// Ersatz für die IBU-Schnittstelle, die seit November 2026 eine Anmeldung verlangt (401). Läuft stündlich.

import { writeFile, mkdir, readFile } from "node:fs/promises";

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
        // Eigene Seite der Station ("Biathlon-Weltcup in Kontiolahti 2026/27") – dort stehen die Ergebnislisten mit Zeiten
        let page = (/\[\[(Biathlon-[^\]|]+)\|/.exec(title) || [])[1] || null;
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
                place: station.name, nat: station.nat, type, podium, page });
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

// ---------- Stationsseiten: Ergebnislisten mit Zeit und Rückstand, Startzeiten ----------
// Aufbau: == Verlauf == → === Sprint === → ==== Frauen ==== → "Start: Donnerstag, 26. November 2026, 16:10 Uhr" →
// Tabelle Platz | Sportler | Zeit ("46:29,8 min" bzw. "+1:20,1") | Schießfehler (Top 10 und deutschsprachige Athleten)

const PAGES = {};
async function stationPage(title) {
    if (!(title in PAGES)) PAGES[title] = await wikitext(title).catch(e => { console.log(e.message); return ""; });
    return PAGES[title];
}

const norm = s => String(s).toLowerCase().replace(/[^a-zäöüß]/g, "");

// Abschnitt einer Disziplin und eines Geschlechts: { start: Date|null, rows: [{ rank, name, nat, time }] }
function stationRace(text, name, gender) {
    let base = norm(name.replace(/\s+\d.*$/, "").replace(/×.*$/, ""));
    let verlauf = section(text, /^== Verlauf ==/m, /^== /m) || text;
    let parts = verlauf.split(/^=== /m).slice(1);
    let part = parts.find(p => norm(p.split("\n")[0].replace(/=+/g, "")) === base);
    if (!part) return null;
    let sub = part.split(/^==== /m).find(p => (gender === "men" ? /^Männer/ : /^Frauen/).test(p));
    if (!sub) return null;
    let st = /Start:\s*\w+,\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})/.exec(sub);
    let start = null;
    if (st && MONTHS[st[2].toLowerCase()] !== undefined) {
        // Ortszeit (MEZ, im Winter UTC+1)
        start = new Date(Date.UTC(Number(st[3]), MONTHS[st[2].toLowerCase()], Number(st[1]), Number(st[4]) - 1, Number(st[5])));
    }
    let rows = [];
    for (let row of sub.split(/\n\|-/).slice(1)) {
        let lines = row.split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && !l.startsWith("|}"));
        let cell = l => (l || "").replace(/^\|\s*(style="[^"]*"\s*\|)?\s*/, "").trim();
        let rank = Number(cell(lines[0]));
        let person = country(cell(lines[1]));
        let time = cell(lines[2]).replace(/\s*min$/, "");
        if (rank && person && person.name) rows.push({ rank, name: shortName(person.name), nat: person.nat, time });
    }
    return { start, rows };
}

// Rennen um Zeiten und die besten Deutschen außerhalb der Top 3 ergänzen; Termine um die Startzeit
async function enrich(race, gender) {
    if (!race.page) return race;
    let info = stationRace(await stationPage(race.page), race.name, gender);
    if (!info) return race;
    if (info.start) {
        race.start = info.start.toISOString();
        race.timed = true;
    }
    if (info.rows.length >= PODIUM && !/Staffel|Mixed/.test(race.name)) {
        race.podium = info.rows.slice(0, PODIUM).map(r => ({ name: r.name, nat: r.nat, time: r.time }));
        race.germans = info.rows.filter(r => r.nat === "GER" && r.rank > PODIUM).slice(0, GERMANS)
            .map(r => ({ rank: r.rank, name: r.name, nat: r.nat, time: r.time }));
    }
    return race;
}


// ---------- Biathlon Lab (biathlonlab.com): vollständige Ergebnislisten mit Zeit und Rückstand ----------
// Inoffizielles Fanprojekt, Daten aus dem IBU Datacenter, robots.txt erlaubt das Crawlen. Nur beendete Rennen,
// keine Termine. Beendete Rennen ändern sich nicht mehr: einmal geladene Ergebnisse werden aus data/biathlon.json
// wiederverwendet, sodass pro Lauf meist nur die Rennliste abgerufen wird.

const LAB = "https://biathlonlab.com";
const LAB_MONTHS = { jan: 0, feb: 1, "mär": 2, mrz: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11 };
const strip = h => String(h).replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;|­/g, m => (m === "&nbsp;" ? " " : "")).replace(/\s+/g, " ").trim();

async function labPage(path) {
    let res = await fetch(LAB + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (res.status !== 200) throw new Error(`Biathlon Lab ${path}: HTTP ${res.status}`);
    return res.text();
}

// Rennliste einer Saison: [{ path, id }] (neueste zuerst) und Links zu anderen Saisons { "2025/26": path }
function labRaceList(html) {
    let races = [], seasons = {};
    for (let m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        let text = strip(m[2]);
        let race = /^\/de\/race\/([A-Z0-9]+)$/.exec(m[1]);
        if (race && !races.some(r => r.id === race[1])) races.push({ path: m[1], id: race[1], day: labListDay(race[1], text) });
        else if (/^\d{4}\/\d{2}$/.test(text) && m[1].startsWith("/de/")) seasons[text] = m[1];
    }
    // Neueste zuerst (Rennen ohne erkennbares Datum ans Ende)
    races.sort((a, b) => (b.day || "").localeCompare(a.day || ""));
    return { races, seasons };
}

// Datum aus dem Linktext ("… Kontiolahti 26. Nov. Einzel …"), Jahr aus der Saison in der Kennung (BT2627… → 2026/27)
function labListDay(id, text) {
    let m = [...text.matchAll(/(\d{1,2})\.\s*([A-Za-zä]{3,})\.?/g)].find(x => LAB_MONTHS[x[2].slice(0, 3).toLowerCase()] !== undefined);
    let season = /^BT(\d{2})\d{2}/.exec(id);
    if (!m || !season) return "";
    let month = LAB_MONTHS[m[2].slice(0, 3).toLowerCase()];
    let year = 2000 + Number(season[1]) + (month >= 6 ? 0 : 1);
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

// Rennen aus der IBU-Kennung: BT2627SWRLCP01SMIN → Männer (SM), Frauen (SW); Staffeln/Mixed werden übersprungen
function labGender(id) {
    let m = /S([MW])(\w{2})$/.exec(id);
    if (!m || /^(RL|RE)$/.test(m[2])) return null;
    return m[1] === "M" ? "men" : "women";
}

// "Einzel der Männer über 20 km" → "Einzel 20 km", "Verkürztes Einzel der Frauen über 12,5 km" → "Kurzeinzel 12,5 km"
function labDiscipline(title) {
    let dist = /über\s+([\d,]+\s*km)/.exec(title);
    let base = title.replace(/\s+der\s+(Männer|Frauen)[\s\S]*$/, "").replace(/verkürzte[sr]?\s+Einzel/i, "Kurzeinzel");
    return discipline(dist ? `${base} (${dist[1]})` : base);
}

function labRace(html, id) {
    let title = strip((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || "");
    if (!title) title = strip((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || "").replace(/,.*$/, "");
    let text = strip(html);
    // "1. Weltcup · Kontiolahti · Do., 26. Nov. 2026 · Endergebnis"
    let head = /(Weltcup|Weltmeisterschaft|WM|Olympi\w*)\s*·\s*([^·]+?)\s*·\s*\w+\.?,\s*(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s+(\d{4})/.exec(text);
    if (!head) throw new Error(`${id}: Kopfzeile nicht gefunden`);
    let month = LAB_MONTHS[head[4].slice(0, 3).toLowerCase()];
    let date = new Date(Date.UTC(Number(head[5]), month, Number(head[3]), 11));
    let rows = [];
    for (let m of html.matchAll(/<tr id="r-[^"]*">([\s\S]*?)<\/tr>/g)) {
        // "6 P. Horn GER 48:32,4 +2:02,6 2 …"
        let r = /^(\d+)\s+(.+?)\s+([A-Z]{3})\s+((?:\d+:)?\d{1,2}:\d{2},\d)\s*(\+(?:\d+:)?\d{1,2}(?::\d{2})?,\d)?/.exec(strip(m[1]));
        if (r) rows.push({ rank: Number(r[1]), name: r[2], nat: r[3], time: r[5] || r[4] });
    }
    if (rows.length < PODIUM) throw new Error(`${id}: nur ${rows.length} Ergebnisse`);
    let type = /Weltmeister|WM/.test(head[1]) ? "WM" : /Olymp/.test(head[1]) ? "Olympia" : "Weltcup";
    return {
        id: `lab-${id}`, name: labDiscipline(title), start: date.toISOString(), place: head[2].trim(), nat: "", type,
        podium: rows.slice(0, PODIUM).map(r => ({ name: r.name, nat: r.nat, time: r.time })),
        germans: rows.filter(r => r.nat === "GER" && r.rank > PODIUM).slice(0, GERMANS)
            .map(r => ({ rank: r.rank, name: r.name, nat: r.nat, time: r.time })),
        source: "lab",
    };
}

// Die letzten PAST Einzelrennen je Geschlecht (bei Saisonbeginn auch aus der Vorsaison)
async function labResults(cache, startYear) {
    let out = { men: [], women: [] };
    let list = labRaceList(await labPage("/de/races"));
    let ids = list.races.map(r => r.id);
    let prev = `${startYear - 1}/${String(startYear).slice(2)}`;
    if (!list.seasons[prev]) prev = null;
    let missing = g => ids.filter(id => labGender(id) === g).length < PAST;
    if (prev && (missing("men") || missing("women"))) {
        let older = labRaceList(await labPage(list.seasons[prev])).races.map(r => r.id);
        ids = ids.concat(older.filter(id => !ids.includes(id)));
    }
    for (let gender of ["men", "women"]) {
        for (let id of ids.filter(id => labGender(id) === gender).slice(0, PAST)) {
            let race = cache[`lab-${id}`];
            if (!race) {
                race = labRace(await labPage(`/de/race/${id}`), id);
                console.log(`  Biathlon Lab geladen: ${id} ${race.place} ${race.name}`);
            }
            out[gender].push(race);
        }
    }
    return out;
}

// Stationsland aus Wikipedia übernehmen (Biathlon Lab nennt nur den Ort)
const sameDay = (a, b) => a.slice(0, 10) === b.slice(0, 10);
const baseName = n => n.replace(/\s+[\d,]+\s*km$/, "").replace(/×.*$/, "");

async function main() {
    let now = new Date();
    let startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    let season = `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
    let title = y => `Biathlon-Weltcup ${y}/${String(y + 1).slice(2)}`;
    let current = await wikitext(title(startYear));
    let previous = await wikitext(title(startYear - 1)).catch(e => { console.log(e.message); return ""; });

    // Bereits geladene Biathlon-Lab-Rennen wiederverwenden
    let cache = {};
    try {
        let before = JSON.parse(await readFile("data/biathlon.json", "utf8"));
        for (let g of ["men", "women"]) for (let r of before.races?.[g]?.past || []) if (r.source === "lab") cache[r.id] = r;
    } catch (e) { /* noch keine Daten */ }
    let lab = null, labUsed = false;
    try {
        lab = await labResults(cache, startYear);
    } catch (e) {
        console.log(`Biathlon Lab: ${e.message} – nur Wikipedia`);
    }

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
        upcoming = upcoming.slice(0, UPCOMING);
        for (let r of past.concat(upcoming)) await enrich(r, gender);
        // Biathlon Lab hat die vollständigen Ergebnislisten meist schon kurz nach dem Rennen
        if (lab && lab[gender].length) {
            for (let r of lab[gender]) {
                let wiki = done.concat(past).find(w => sameDay(w.start, r.start) && baseName(w.name) === baseName(r.name));
                if (wiki) {
                    r.nat = wiki.nat;
                    if (wiki.timed) { r.start = wiki.start; r.timed = true; }
                } else {
                    let station = done.find(w => w.place === r.place && w.nat);
                    if (station) r.nat = station.nat;
                }
            }
            let rest = past.filter(w => !lab[gender].some(r => sameDay(w.start, r.start) && baseName(w.name) === baseName(r.name)));
            // Rennen, die Biathlon Lab (noch) nicht hat – etwa Staffeln –, bleiben aus Wikipedia erhalten
            past = lab[gender].concat(rest)
                .sort((a, b) => b.start.localeCompare(a.start)).slice(0, PAST);
            labUsed = true;
        }
        races[gender] = { past, upcoming };
        cup[gender] = parseStandings(genderPart(current, gender));
    }
    // Vor dem ersten Rennen: Endstand der Vorsaison
    if (!cup.men.count && !cup.women.count && previous) {
        cup = { season: `${String(startYear - 1).slice(2)}${String(startYear).slice(2)}`, final: true,
            men: parseStandings(genderPart(previous, "men")), women: parseStandings(genderPart(previous, "women")) };
    }
    let data = { generated: now.toISOString(), source: labUsed ? "Biathlon Lab" : "Wikipedia", cupSource: "Wikipedia", races, cup };
    for (let g of ["men", "women"]) {
        console.log(`${g}: ${races[g].past.length} Rennen, nächste: ${races[g].upcoming.map(r => `${r.place} ${r.name} ${r.start}`).join(" | ")}`);
        for (let r of races[g].past) {
            console.log(`  ${r.start} ${r.place} ${r.name}: ${r.podium.map(p => `${p.name} ${p.time}`).join(", ")}`
                + `${r.germans && r.germans.length ? " · Deutsche: " + r.germans.map(p => `${p.rank}. ${p.name} ${p.time}`).join(", ") : ""}`);
        }
        console.log(`  Weltcup ${cup.season}${cup.final ? " (Endstand)" : ""}, ${cup[g].count} Athleten: ${cup[g].top.map(r => `${r.rank}. ${r.name} ${r.nat} ${r.score}`).join(", ")}`);
        console.log(`  Deutsche: ${cup[g].bestGermans.map(r => `${r.rank}. ${r.name} ${r.score}`).join(", ")}`);
    }
    if (!races.men.past.length && !races.women.past.length && !cup.men.count) throw new Error("nichts gefunden – alter Stand bleibt");
    await mkdir("data", { recursive: true });
    await writeFile("data/biathlon.json", JSON.stringify(data, null, 1) + "\n");
}

main().catch(e => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 1;
});
