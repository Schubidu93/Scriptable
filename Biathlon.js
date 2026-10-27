// Biathlon – Weltcup, WM und Olympia. Quelle: IBU (biathlonresults.com).
//
// Zwei Ansichten:
//   "rennen"  (Standard): die letzten 3 Rennen mit Top 3 und die nächsten 3 Rennen,
//                         je für Männer oder Frauen – großes Widget
//   "weltcup":            Gesamtweltcup Frauen | Männer, Top 3 und die 3 besten Deutschen –
//                         großes Widget (auch mittel)
//
// Auswahl im Loader per Function("ANSICHT", "GESCHLECHT", code)("rennen", "frauen")
// oder als Widget-Parameter, z. B. "rennen frauen" oder "weltcup".

const APIS = [
    "https://api.biathlonresults.com/modules/sportapi/api/",
    "https://biathlonresults.com/modules/sportapi/api/",
];
const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const VIEW = String((typeof ANSICHT !== "undefined" && ANSICHT) || params.find(p => p === "weltcup") || "rennen").toLowerCase();
const WOMEN = String((typeof GESCHLECHT !== "undefined" && GESCHLECHT) || params.find(p => p === "frauen") || "").toLowerCase() === "frauen";

const CONFIG = {
    past: 3,
    upcoming: 3,
    podium: 3,
    germans: 3,
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `biathlon-${VIEW}${VIEW === "rennen" ? (WOMEN ? "-frauen" : "-maenner") : ""}.json`);
const DIAG = [];

// Zeitpunkt der angezeigten Daten (bei Offline-Anzeige der des Zwischenspeichers)
let UPDATED = Date.now();

// Kleine Zeile „aktualisiert 10:42“ unten rechts – in allen Widgets gleich
function addUpdated(widget, note) {
    let date = new Date(UPDATED);
    let df = new DateFormatter();
    df.dateFormat = date.toDateString() === new Date().toDateString() ? "HH:mm" : "dd.MM. HH:mm";
    let row = widget.addStack();
    row.addSpacer();
    let t = row.addText(`${note ? note + " · " : ""}aktualisiert ${df.string(date)}`);
    t.font = Font.mediumSystemFont(8);
    t.textColor = Color.white();
    t.textOpacity = 0.5;
}

// Beide Adressen der IBU-Schnittstelle probieren
async function api(method, query) {
    let qs = Object.entries(query || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    let lastError;
    for (let base of APIS) {
        try {
            let json = await new Request(`${base}${method}?${qs}`).loadJSON();
            if (json != null) return json;
        } catch (e) {
            lastError = e;
        }
    }
    DIAG.push(`${method}: ${lastError}`);
    throw lastError || new Error(`${method}: keine Antwort`);
}

// Saison-Kennung wie "2627" für 2026/27
async function currentSeason() {
    try {
        let seasons = await api("Seasons");
        let current = seasons.find(s => s.IsCurrent) || seasons.find(s => s.IsCurrentScheduled);
        if (current) return current.SeasonId;
    } catch (e) {
        console.log(`Saisons nicht geladen: ${e}`);
    }
    let now = new Date();
    let y = now.getFullYear() % 100;
    return now.getMonth() >= 6 ? `${y}${y + 1}` : `${y - 1}${y}`;
}

function previousSeason(season) {
    let a = Number(season.slice(0, 2)), b = Number(season.slice(2));
    let pad = n => String((n + 100) % 100).padStart(2, "0");
    return `${pad(a - 1)}${pad(b - 1)}`;
}

// Nur Weltcup (CP), WM (CH) und Olympia (OG)
function eventType(eventId) {
    if (/SWRLOG/.test(eventId)) return "Olympia";
    if (/SWRLCH/.test(eventId)) return "WM";
    if (/SWRLCP/.test(eventId)) return "Weltcup";
    return null;
}

async function loadEvents(season) {
    let events = await api("Events", { SeasonId: season, Level: 0 }).catch(() => []);
    return (events || [])
        .filter(e => eventType(e.EventId))
        .map(e => ({
            id: e.EventId,
            place: e.ShortDescription || e.Organizer || "",
            nat: e.Nat || e.NatName || "",
            type: eventType(e.EventId),
            start: new Date(e.StartDate),
            end: new Date(e.EndDate),
        }));
}

// "BT2425SWRLCP01SWSP" → Männer "SM", Frauen "SW", Mixed "MX"
function raceGender(raceId) {
    return raceId.slice(-4, -2);
}

const DISCIPLINES = [
    [/single mixed relay/i, "Single-Mixed"],
    [/mixed relay/i, "Mixed-Staffel"],
    [/relay/i, "Staffel"],
    [/short individual/i, "Kurzeinzel"],
    [/individual/i, "Einzel"],
    [/mass start/i, "Massenstart"],
    [/pursuit/i, "Verfolgung"],
    [/sprint/i, "Sprint"],
];

// "Women 7.5km Sprint" → "Sprint 7,5 km"
function discipline(description) {
    let found = DISCIPLINES.find(([re]) => re.test(description));
    let name = found ? found[1] : description.replace(/^(Men|Women)\s+/i, "");
    let km = /(\d+(?:\.\d+)?)\s*km/i.exec(description);
    let relay = /(\d)\s*x\s*(\d+(?:\.\d+)?)\s*km/i.exec(description);
    if (relay) return `${name} ${relay[1]}×${relay[2].replace(".", ",")} km`;
    return km ? `${name} ${km[1].replace(".", ",")} km` : name;
}

async function loadRaces(event) {
    let comps = await api("Competitions", { EventId: event.id }).catch(() => []);
    let gender = WOMEN ? "SW" : "SM";
    return (comps || [])
        .filter(c => raceGender(c.RaceId) === gender)
        .map(c => ({
            id: c.RaceId,
            name: discipline(c.ShortDescription || c.Description || ""),
            start: new Date(c.StartTime),
            place: event.place,
            nat: event.nat,
            type: event.type,
        }));
}

// "PREUSS Franziska" → "F. Preuss"
function shortName(name) {
    let words = String(name || "").split(" ").filter(Boolean);
    let isSurname = w => w.length > 1 && w === w.toUpperCase();
    let last = words.filter(isSurname).map(w => w.charAt(0) + w.slice(1).toLowerCase()
        .replace(/[-'](\p{L})/gu, m => m.toUpperCase()));
    let first = words.filter(w => !isSurname(w));
    if (!last.length) return words.join(" ");
    return first.length ? `${first[0].charAt(0)}. ${last.join(" ")}` : last.join(" ");
}

async function loadPodium(race) {
    let json = await api("Results", { RaceId: race.id });
    let rows = (json.Results || []).filter(r => Number(r.Rank) > 0);
    rows.sort((a, b) => Number(a.Rank) - Number(b.Rank));
    return rows.slice(0, CONFIG.podium).map((r, i) => ({
        name: shortName(r.Name || r.ShortName), // Staffeln: "NORWAY" → "Norway"
        nat: r.Nat,
        time: i === 0 ? (r.TotalTime || "") : (r.Behind || ""),
    }));
}

async function loadRaceData() {
    let now = new Date();
    let season = await currentSeason();
    let events = await loadEvents(season);

    // Vergangene Rennen: rückwärts durch die Stationen, bis genug Rennen beisammen sind
    let pastEvents = events.filter(e => e.start <= now).sort((a, b) => b.start - a.start);
    if (pastEvents.length < 2) {
        let previous = await loadEvents(previousSeason(season));
        pastEvents = pastEvents.concat(previous.sort((a, b) => b.start - a.start));
    }
    let past = [];
    for (let event of pastEvents.slice(0, 4)) {
        let races = (await loadRaces(event)).filter(r => r.start < new Date(now.getTime() - 2 * 3600000));
        races.sort((a, b) => b.start - a.start);
        for (let race of races) {
            if (past.length >= CONFIG.past) break;
            try {
                let podium = await loadPodium(race);
                if (podium.length) past.push({ ...race, podium });
            } catch (e) {
                console.log(`${race.name}: Ergebnis nicht geladen: ${e}`);
            }
        }
        if (past.length >= CONFIG.past) break;
    }

    // Nächste Rennen
    let upcoming = [];
    let futureEvents = events.filter(e => e.end >= now).sort((a, b) => a.start - b.start);
    for (let event of futureEvents.slice(0, 3)) {
        let races = (await loadRaces(event)).filter(r => r.start >= now);
        upcoming = upcoming.concat(races);
        if (upcoming.length >= CONFIG.upcoming) break;
    }
    upcoming.sort((a, b) => a.start - b.start);

    return { past, upcoming: upcoming.slice(0, CONFIG.upcoming) };
}

// Gesamtweltcup: Top 3 und die besten Deutschen außerhalb der Top 3
async function loadCup(season, gender) {
    let json = await api("CupResults", { CupId: `BT${season}SWRLCP__${gender}TS` });
    let rows = (json.Rows || []).map(r => ({
        rank: Number(r.Rank),
        name: shortName(r.Name || r.ShortName),
        nat: r.Nat,
        score: r.Score,
    })).filter(r => r.rank > 0);
    rows.sort((a, b) => a.rank - b.rank);
    let top = rows.slice(0, CONFIG.podium);
    let germans = rows.filter(r => r.nat === "GER" && r.rank > CONFIG.podium).slice(0, CONFIG.germans);
    return { top, germans };
}

async function loadCupData() {
    let season = await currentSeason();
    let final = false;
    let women = await loadCup(season, "SW").catch(() => ({ top: [] }));
    let men = await loadCup(season, "SM").catch(() => ({ top: [] }));
    // Vor dem ersten Rennen: Endstand der Vorsaison
    if (!women.top.length && !men.top.length) {
        season = previousSeason(season);
        final = true;
        women = await loadCup(season, "SW");
        men = await loadCup(season, "SM");
    }
    return { season, final, women, men };
}

function reviveDates(data) {
    let revive = r => ({ ...r, start: new Date(r.start) });
    if (data.past) data.past = data.past.map(revive);
    if (data.upcoming) data.upcoming = data.upcoming.map(revive);
    return data;
}

async function loadWithCache() {
    try {
        let data = VIEW === "weltcup" ? await loadCupData() : await loadRaceData();
        let empty = VIEW === "weltcup" ? !data.women.top.length && !data.men.top.length : !data.past.length && !data.upcoming.length;
        if (!empty) {
            data.updated = Date.now();
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
        DIAG.push("Keine Rennen gefunden");
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
        DIAG.push(`Fehler: ${e}`);
    }
    DIAG.forEach(line => console.log(line));
    if (fm.fileExists(cachePath)) {
        let data = reviveDates(JSON.parse(fm.readString(cachePath)));
        data.stale = true;
        if (data.updated) UPDATED = data.updated;
        return data;
    }
    return null;
}

// IOC-Kürzel → Flaggen-Emoji
const IOC_TO_ISO = {
    AUT: "AT", BEL: "BE", BLR: "BY", BUL: "BG", CAN: "CA", CHN: "CN", CRO: "HR", CZE: "CZ",
    DEN: "DK", ESP: "ES", EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB", GER: "DE", ITA: "IT",
    JPN: "JP", KAZ: "KZ", KOR: "KR", LAT: "LV", LTU: "LT", MDA: "MD", NOR: "NO", POL: "PL",
    ROU: "RO", RUS: "RU", SLO: "SI", SRB: "RS", SUI: "CH", SVK: "SK", SWE: "SE", UKR: "UA",
    USA: "US", AUS: "AU", GRE: "GR", HUN: "HU", MGL: "MN", BIH: "BA", ARG: "AR", BRA: "BR",
};

function flag(ioc) {
    let iso = IOC_TO_ISO[ioc];
    return iso ? String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";
}

function withFlag(ioc, text) {
    let f = flag(ioc);
    return f ? `${f} ${text}` : text;
}

function addSymbol(stack, name, size, color) {
    let sym = SFSymbol.named(name) || SFSymbol.named("snowflake");
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    img.imageSize = new Size(size, size);
    img.tintColor = color;
    img.resizable = false;
    return img;
}

function addLabel(stack, text, font, color, opacity = 1) {
    let t = stack.addText(text);
    t.font = font;
    t.textColor = color;
    t.textOpacity = opacity;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.7;
    return t;
}

const WHITE = Color.white();
const MEDALS = [new Color("#F5C542"), new Color("#C9D1D9"), new Color("#D08A4E")];
const GERMAN = new Color("#FFCE00");

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#3A7BD5"), new Color("#123A6B")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function formatDate(date) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "dd.MM.";
    return df.string(date);
}

function formatStart(date) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "EE dd.MM. · HH:mm";
    return df.string(date);
}

function addHeader(widget, title, info, stale) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "figure.skiing.crosscountry", 15, WHITE);
    header.addSpacer(5);
    addLabel(header, title, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    addLabel(header, [info, stale ? "offline" : ""].filter(Boolean).join(" · "), Font.semiboldSystemFont(11), WHITE, 0.6);
}

function addTypeTag(stack, type) {
    if (type === "Weltcup") return;
    let tag = stack.addStack();
    tag.backgroundColor = new Color("#ffffff", 0.2);
    tag.cornerRadius = 4;
    tag.setPadding(1, 4, 1, 4);
    addLabel(tag, type, Font.boldSystemFont(9), WHITE);
    stack.addSpacer(5);
}

// Nur der Ort: "Oslo Holmenkollen" → "Oslo", "Nove Mesto na Morave" → "Nove Mesto"
const PLACE_NAMES = {
    "Oslo Holmenkollen": "Oslo",
    "Nove Mesto na Morave": "Nove Mesto",
    "Antholz-Anterselva": "Antholz",
    "Le Grand-Bornand": "Grand-Bornand",
    "Soldier Hollow": "Soldier Hollow",
};
function shortPlace(place) {
    let p = String(place || "").trim();
    return PLACE_NAMES[p] || p.replace(/\s+Holmenkollen$/i, "");
}

// Schriftgröße der Athletennamen – in Rennergebnissen und Gesamtweltcup gleich
const NAME_SIZE = 10.5;

function addPastRace(stack, race) {
    let block = stack.addStack();
    block.layoutVertically();

    let title = block.addStack();
    title.centerAlignContent();
    addTypeTag(title, race.type);
    // Alle Wettkampfnamen gleich groß – nicht automatisch verkleinern
    addLabel(title, `${withFlag(race.nat, shortPlace(race.place))} · ${race.name}`, Font.semiboldSystemFont(12), WHITE)
        .minimumScaleFactor = 1;
    title.addSpacer(6);
    title.addSpacer();
    addLabel(title, formatDate(race.start), Font.mediumSystemFont(10), WHITE, 0.6);

    race.podium.forEach((p, i) => {
        block.addSpacer(3);
        let row = block.addStack();
        row.centerAlignContent();
        addSymbol(row, `${i + 1}.circle.fill`, 12, MEDALS[i]);
        row.addSpacer(5);
        // Gleiche Größe wie im Gesamtweltcup; nicht automatisch verkleinern, damit beide gleich wirken
        addLabel(row, withFlag(p.nat, p.name), Font.mediumSystemFont(NAME_SIZE), p.nat === "GER" ? GERMAN : WHITE)
            .minimumScaleFactor = 1;
        row.addSpacer(6);
        row.addSpacer();
        addLabel(row, p.time, Font.mediumMonospacedSystemFont(10), WHITE, 0.6);
    });
}

function addUpcomingRace(stack, race) {
    let row = stack.addStack();
    row.centerAlignContent();
    addSymbol(row, "calendar", 11, WHITE);
    row.addSpacer(5);
    addTypeTag(row, race.type);
    addLabel(row, `${withFlag(race.nat, shortPlace(race.place))} · ${race.name}`, Font.mediumSystemFont(12), WHITE)
        .minimumScaleFactor = 1;
    row.addSpacer(6);
    row.addSpacer();
    addLabel(row, formatStart(race.start), Font.mediumSystemFont(10), WHITE, 0.6);
}

function addSectionTitle(stack, text) {
    addLabel(stack, text.toUpperCase(), Font.semiboldSystemFont(11), WHITE, 0.6);
}

function buildRaces(widget, data, large) {
    addHeader(widget, `Biathlon ${WOMEN ? "Frauen" : "Männer"}`, "IBU", data.stale);
    widget.addSpacer(6);

    let past = data.past.slice(0, large ? CONFIG.past : 1);
    if (!past.length) addLabel(widget, "Noch keine Ergebnisse", Font.mediumSystemFont(12), WHITE, 0.7);
    past.forEach((race, i) => {
        if (i > 0) widget.addSpacer(10);
        addPastRace(widget, race);
    });

    widget.addSpacer();
    addSectionTitle(widget, "Nächste Rennen");
    let upcoming = data.upcoming.slice(0, large ? CONFIG.upcoming : 2);
    if (!upcoming.length) {
        widget.addSpacer(4);
        addLabel(widget, "Noch keine Termine", Font.mediumSystemFont(12), WHITE, 0.7);
    }
    upcoming.forEach(race => {
        widget.addSpacer(5);
        addUpcomingRace(widget, race);
    });
}

// Kompakt (mittleres Widget): kleinere Schrift, Deutsche nur durch Abstand und Farbe abgesetzt
function addCupColumn(stack, title, cup, compact) {
    let col = stack.addStack();
    col.layoutVertically();
    addSectionTitle(col, title);
    col.addSpacer(compact ? 2 : 4);

    let addRow = r => {
        col.addSpacer(compact ? 1 : 4);
        let row = col.addStack();
        row.centerAlignContent();
        addLabel(row, `${r.rank}`, Font.mediumMonospacedSystemFont(NAME_SIZE), WHITE, 0.6).minimumScaleFactor = 1;
        row.addSpacer(4);
        addLabel(row, withFlag(r.nat, r.name), Font.mediumSystemFont(NAME_SIZE), r.nat === "GER" ? GERMAN : WHITE)
            .minimumScaleFactor = 1;
        row.addSpacer(4);
        row.addSpacer();
        // Punkte und Platz nicht automatisch verkleinern – alle gleich groß
        addLabel(row, `${r.score}`, Font.semiboldMonospacedSystemFont(NAME_SIZE), WHITE, 0.85).minimumScaleFactor = 1;
    };
    (cup.top || []).forEach(addRow);
    if (cup.germans && cup.germans.length) {
        if (compact) {
            col.addSpacer(4);
        } else {
            col.addSpacer(10);
            addLabel(col, "BESTE DEUTSCHE", Font.semiboldSystemFont(10), WHITE, 0.5);
        }
        cup.germans.forEach(addRow);
    }
    col.addSpacer();
}

function buildCup(widget, data, compact) {
    let season = `${data.season.slice(0, 2)}/${data.season.slice(2)}`;
    addHeader(widget, "Gesamtweltcup", data.final ? `Endstand ${season}` : `Saison ${season}`, data.stale);
    widget.addSpacer(compact ? 5 : 12);
    let row = widget.addStack();
    if (compact) {
        addCupColumn(row, "Frauen", data.women, true);
        row.addSpacer(16);
        addCupColumn(row, "Männer", data.men, true);
    } else {
        row.layoutVertically();
        addCupColumn(row, "Frauen", data.women, false);
        row.addSpacer(14);
        addCupColumn(row, "Männer", data.men, false);
    }
}

function buildError(widget) {
    addHeader(widget, "Biathlon", "IBU", false);
    widget.addSpacer(6);
    addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(13), WHITE, 0.8);
    widget.addSpacer(6);
    DIAG.slice(0, 6).forEach(line => {
        let t = addLabel(widget, line, Font.regularMonospacedSystemFont(10), WHITE, 0.6);
        t.lineLimit = 2;
    });
    widget.addSpacer();
}

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    // Antippen startet das Skript in Scriptable (frische Daten) statt eine Website zu öffnen
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(14, 16, 6, 16);

    if (!data) {
        buildError(widget);
    } else if (VIEW === "weltcup") {
        let compact = Boolean(config.widgetFamily) && config.widgetFamily !== "large" && config.widgetFamily !== "extraLarge";
        if (compact) widget.setPadding(12, 16, 4, 16);
        buildCup(widget, data, compact);
    } else {
        buildRaces(widget, data, config.widgetFamily !== "medium");
    }
    if (data) addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        await widget.presentLarge();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
