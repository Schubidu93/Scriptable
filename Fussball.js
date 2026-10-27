// Fußball mit Fokus FC Bayern. Quelle: ESPN (öffentliche Schnittstelle).
//
// Ansichten (ANSICHT):
//   "team" (Standard): Lieblingsteam in Bundesliga oder CL – letztes Spiel, Form,
//                      nächstes Spiel (am Spieltag live), Tabellen-Ausschnitt bzw. K.-o.-Runde
//   "ergebnisse":      letzte Ergebnisse und laufende Spiele des Wettbewerbs
//   "pokal":           DFB-Pokal – letzte zwei Spiele und nächste Runde
//   "ergebnisse" mit LIGA "pokal": alle Spiele der aktuellen Pokalrunde (bzw. Vorschau auf die ausgeloste nächste)
// Wettbewerb (LIGA): "bundesliga" (Standard) oder "cl".
//
// Im Loader per Function("ANSICHT", "LIGA", code)("ergebnisse", "cl")
// oder als Widget-Parameter, z. B. "ergebnisse cl" oder "pokal".

const ESPN = "https://site.api.espn.com/apis/";
const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const VIEW = String((typeof ANSICHT !== "undefined" && ANSICHT) || params.find(p => ["team", "ergebnisse", "pokal"].includes(p)) || "team").toLowerCase();
const LEAGUE_KEY = VIEW === "pokal" ? "pokal"
    : String((typeof LIGA !== "undefined" && LIGA) || params.find(p => p === "cl" || p === "bundesliga") || "bundesliga").toLowerCase();
const TEAM_ID = String((typeof TEAM !== "undefined" && TEAM) || "132"); // 132 = FC Bayern München

const LEAGUES = {
    bundesliga: {
        slug: "ger.1",
        title: "Bundesliga",
        table: "Bundesliga",
        colors: ["#D3122F", "#7A0A1E"],
        url: "https://www.espn.com/soccer/standings/_/league/ger.1",
    },
    cl: {
        slug: "uefa.champions",
        title: "Champions League",
        table: "Ligaphase",
        colors: ["#1B2A6B", "#070F33"],
        url: "https://www.espn.com/soccer/standings/_/league/uefa.champions",
    },
    pokal: {
        slug: "ger.dfb_pokal",
        title: "DFB-Pokal",
        table: "",
        colors: ["#1E6B3A", "#0A2E18"],
        url: "https://www.espn.com/soccer/scoreboard/_/league/ger.dfb_pokal",
    },
};
const LEAGUE = LEAGUES[LEAGUE_KEY] || LEAGUES.bundesliga;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `fussball-${VIEW}-${LEAGUE_KEY}-${TEAM_ID}.json`);
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

async function loadJSON(path) {
    try {
        return await new Request(ESPN + path).loadJSON();
    } catch (e) {
        DIAG.push(`${path.split("?")[0]}: ${e}`);
        throw e;
    }
}

function ymd(date) {
    let pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// Deutsche Vereinsnamen und Kürzel – ESPN liefert englische Namen.
// [deutscher Name, Kürzel, englische Schreibweisen bei ESPN …]
const GERMAN_NAMES = [
    ["FC Bayern", "FCB", "Bayern Munich", "Bayern München", "FC Bayern Munich"],
    ["Dortmund", "BVB", "Borussia Dortmund", "Dortmund"],
    ["Leverkusen", "B04", "Bayer Leverkusen", "Leverkusen"],
    ["RB Leipzig", "RBL", "RB Leipzig", "Leipzig"],
    ["Frankfurt", "SGE", "Eintracht Frankfurt", "Frankfurt"],
    ["Stuttgart", "VfB", "VfB Stuttgart", "Stuttgart"],
    ["Gladbach", "BMG", "Borussia Monchengladbach", "Monchengladbach", "Mgladbach", "Borussia Mgladbach", "Gladbach"],
    ["Wolfsburg", "WOB", "VfL Wolfsburg", "Wolfsburg"],
    ["Freiburg", "SCF", "SC Freiburg", "Freiburg"],
    ["Hoffenheim", "TSG", "TSG Hoffenheim", "Hoffenheim", "TSG 1899 Hoffenheim"],
    ["Union Berlin", "FCU", "1 FC Union Berlin", "Union Berlin", "FC Union Berlin"],
    ["Werder Bremen", "SVW", "Werder Bremen", "Bremen", "SV Werder Bremen"],
    ["Augsburg", "FCA", "FC Augsburg", "Augsburg"],
    ["Mainz 05", "M05", "1 FSV Mainz 05", "Mainz", "Mainz 05", "FSV Mainz 05"],
    ["Heidenheim", "FCH", "1 FC Heidenheim 1846", "Heidenheim", "1 FC Heidenheim"],
    ["St. Pauli", "STP", "FC St Pauli", "St Pauli"],
    ["1. FC Köln", "KOE", "1 FC Koln", "FC Cologne", "Cologne", "Koln", "FC Koln"],
    ["Hamburger SV", "HSV", "Hamburg SV", "Hamburg", "Hamburger SV"],
    ["Bochum", "BOC", "VfL Bochum", "Bochum"],
    ["Holstein Kiel", "KSV", "Holstein Kiel", "Kiel"],
    ["Hertha BSC", "BSC", "Hertha Berlin", "Hertha BSC"],
    ["Schalke 04", "S04", "Schalke 04", "FC Schalke 04", "Schalke"],
    ["Darmstadt", "D98", "SV Darmstadt 98", "Darmstadt"],
    ["Düsseldorf", "F95", "Fortuna Dusseldorf", "Dusseldorf"],
    ["Hannover 96", "H96", "Hannover 96", "Hannover"],
    ["Paderborn", "SCP", "SC Paderborn 07", "Paderborn"],
    ["Kaiserslautern", "FCK", "1 FC Kaiserslautern", "Kaiserslautern"],
    ["Elversberg", "SVE", "SV Elversberg", "SV 07 Elversberg", "Elversberg"],
    ["Magdeburg", "FCM", "1 FC Magdeburg", "Magdeburg"],
    ["Nürnberg", "FCN", "1 FC Nurnberg", "Nurnberg", "FC Nurnberg"],
    ["Karlsruhe", "KSC", "Karlsruher SC", "Karlsruhe"],
    ["Bielefeld", "DSC", "Arminia Bielefeld", "Bielefeld"],
    ["Fürth", "SGF", "Greuther Furth", "SpVgg Greuther Furth", "Furth"],
    ["Braunschweig", "EBS", "Eintracht Braunschweig", "Braunschweig"],
    ["Münster", "SCM", "Preussen Munster", "SC Preussen Munster", "Munster"],
    ["Dresden", "SGD", "Dynamo Dresden", "Dresden"],
    ["Saarbrücken", "FCS", "1 FC Saarbrucken", "Saarbrucken"],
    ["Regensburg", "SSV", "Jahn Regensburg", "SSV Jahn Regensburg", "Regensburg"],
    ["Rostock", "FCH", "Hansa Rostock", "FC Hansa Rostock", "Rostock"],
    ["Real Madrid", "RMA", "Real Madrid"],
    ["FC Barcelona", "BAR", "Barcelona", "FC Barcelona"],
    ["Atlético Madrid", "ATM", "Atletico Madrid", "Atletico de Madrid"],
    ["Athletic Bilbao", "ATH", "Athletic Club", "Athletic Bilbao"],
    ["Man City", "MCI", "Manchester City", "Man City"],
    ["Man United", "MUN", "Manchester United", "Man United"],
    ["FC Liverpool", "LIV", "Liverpool"],
    ["FC Arsenal", "ARS", "Arsenal"],
    ["FC Chelsea", "CHE", "Chelsea"],
    ["Tottenham", "TOT", "Tottenham Hotspur", "Tottenham"],
    ["Newcastle", "NEW", "Newcastle United", "Newcastle"],
    ["Aston Villa", "AVL", "Aston Villa"],
    ["Paris SG", "PSG", "Paris Saint-Germain", "Paris Saint Germain", "PSG"],
    ["Marseille", "OM", "Marseille", "Olympique Marseille", "Olympique de Marseille"],
    ["AS Monaco", "ASM", "AS Monaco", "Monaco"],
    ["OSC Lille", "LIL", "Lille", "LOSC Lille"],
    ["Inter Mailand", "INT", "Internazionale", "Inter Milan", "Inter"],
    ["AC Mailand", "ACM", "AC Milan", "Milan"],
    ["Juventus Turin", "JUV", "Juventus"],
    ["SSC Neapel", "NAP", "Napoli", "SSC Napoli"],
    ["Atalanta Bergamo", "ATA", "Atalanta"],
    ["AS Rom", "ROM", "AS Roma", "Roma"],
    ["Benfica Lissabon", "BEN", "Benfica", "SL Benfica"],
    ["Sporting Lissabon", "SPO", "Sporting CP", "Sporting Lisbon"],
    ["FC Porto", "POR", "Porto", "FC Porto"],
    ["PSV Eindhoven", "PSV", "PSV Eindhoven", "PSV"],
    ["Ajax Amsterdam", "AJA", "Ajax", "Ajax Amsterdam"],
    ["Feyenoord", "FEY", "Feyenoord", "Feyenoord Rotterdam"],
    ["Celtic Glasgow", "CEL", "Celtic"],
    ["FC Brügge", "BRU", "Club Brugge"],
    ["RB Salzburg", "SAL", "Red Bull Salzburg", "RB Salzburg", "Salzburg"],
    ["Schachtar Donezk", "SHA", "Shakhtar Donetsk"],
    ["FC Kopenhagen", "KOP", "FC Copenhagen", "Copenhagen"],
    ["Slavia Prag", "SLA", "Slavia Prague"],
    ["Sparta Prag", "SPA", "Sparta Prague"],
    ["Roter Stern Belgrad", "CZV", "Crvena Zvezda", "Red Star Belgrade"],
    ["Olympiakos Piräus", "OLY", "Olympiacos"],
    ["Galatasaray", "GAL", "Galatasaray"],
    ["Young Boys Bern", "YB", "BSC Young Boys", "Young Boys"],
];

function normalizeName(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[.'’]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const GERMAN_LOOKUP = {};
GERMAN_NAMES.forEach(([name, abbr, ...aliases]) => {
    aliases.concat(name).forEach(alias => { GERMAN_LOOKUP[normalizeName(alias)] = { name, abbr }; });
});

function germanTeam(team) {
    for (let key of [team.displayName, team.shortDisplayName, team.name, team.location]) {
        let hit = GERMAN_LOOKUP[normalizeName(key)];
        if (hit) return hit;
    }
    return { name: team.shortDisplayName || team.displayName, abbr: team.abbreviation || team.shortDisplayName };
}

function logoUrl(team) {
    if (!team) return null;
    if (team.logo) return team.logo;
    if (team.logos && team.logos.length) return team.logos[0].href;
    return null;
}

function statusOf(event) {
    let comp = event.competitions && event.competitions[0];
    return (comp && comp.status) || event.status || { type: {} };
}

function stateOf(event) {
    return statusOf(event).type.state; // "pre", "in", "post"
}

function score(competitor) {
    let s = competitor && competitor.score;
    if (s == null) return "";
    if (typeof s === "object") return s.displayValue != null ? String(s.displayValue) : String(s.value);
    return String(s);
}

// "1. Halbzeit · 23'", "Halbzeit", "2. Halbzeit · 67'", "Verlängerung · 105'", "Elfmeterschießen"
function liveDetail(status) {
    let detail = `${(status.type && status.type.shortDetail) || ""} ${(status.type && status.type.description) || ""}`;
    if (/half ?time|HT/i.test(detail)) return "Halbzeit";
    if (/pen/i.test(detail)) return "Elfmeterschießen";
    let period = Number(status.period) || 0;
    let clock = status.displayClock || "";
    let label = period > 2 ? "Verlängerung" : period ? `${period}. Halbzeit` : "";
    return [label, clock].filter(Boolean).join(" · ") || detail.trim();
}

// Aus Sicht des eigenen Teams: Gegner, Heim/Auswärts, Ergebnis S/U/N
function gameInfo(event) {
    let comp = event.competitions[0];
    let us = comp.competitors.find(c => String(c.team.id) === TEAM_ID) || comp.competitors[0];
    let them = comp.competitors.find(c => c !== us);
    let ourScore = score(us), theirScore = score(them);
    let result = "";
    if (stateOf(event) === "post") {
        let a = Number(ourScore), b = Number(theirScore);
        if (us.winner === true || a > b) result = "S";
        else if (them.winner === true || a < b) result = "N";
        else result = "U";
    }
    return {
        id: String(event.id),
        date: comp.date || event.date,
        round: roundOf(event),
        suffix: resultSuffix(event, us, them),
        home: us.homeAway === "home",
        opponent: germanTeam(them.team).abbr,
        opponentName: germanTeam(them.team).name,
        opponentLogo: logoUrl(them.team),
        ourScore,
        theirScore,
        result,
    };
}

function involvesTeam(event) {
    let comp = event.competitions && event.competitions[0];
    return comp && comp.competitors.some(c => String(c.team.id) === TEAM_ID);
}

// "n.V." / "i.E. 4:3" bei Verlängerung bzw. Elfmeterschießen
function resultSuffix(event, us, them) {
    let type = statusOf(event).type || {};
    let text = `${type.detail || ""} ${type.shortDetail || ""} ${type.description || ""}`;
    if (us && them && us.shootoutScore != null && them.shootoutScore != null) {
        return `i.E. ${us.shootoutScore}:${them.shootoutScore}`;
    }
    if (/pen/i.test(text)) return "i.E.";
    if (/AET|extra time/i.test(text)) return "n.V.";
    return "";
}

// Runde aus den ESPN-Angaben (Notizen, Saison-Abschnitt) – auf Deutsch
const ROUND_WORDS = [
    [/knockout round play-?offs?|play-?off/i, "Playoffs"],
    [/round of 16|last 16|eighth/i, "Achtelfinale"],
    [/quarter/i, "Viertelfinale"],
    [/semi/i, "Halbfinale"],
    [/\bfinal\b/i, "Finale"],
    [/league phase|league stage/i, "Ligaphase"],
    [/group/i, "Gruppenphase"],
    [/first round|1st round|round 1\b/i, "1. Runde"],
    [/second round|2nd round|round 2\b/i, "2. Runde"],
];
const POKAL_ROUNDS = ["1. Runde", "2. Runde", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"];

function eventTexts(event) {
    let comp = (event.competitions && event.competitions[0]) || {};
    let notes = (comp.notes || []).concat(event.notes || []).map(n => n.headline || n.text || "");
    let season = event.season ? [event.season.slug, event.season.name, event.season.displayName] : [];
    return notes.concat(season).filter(Boolean).map(t => String(t).replace(/-/g, " ")).join(" | ");
}

function roundOf(event) {
    let text = eventTexts(event);
    let hit = ROUND_WORDS.find(([re]) => re.test(text));
    if (hit) return hit[1];
    if (LEAGUE_KEY === "cl") {
        let month = new Date(event.date).getMonth(); // Ligaphase: September bis Januar
        return month >= 6 || month === 0 ? "Ligaphase" : "K.-o.-Runde";
    }
    return "";
}

function legOf(event) {
    let text = eventTexts(event);
    if (/1st leg|first leg/i.test(text)) return "Hinspiel";
    if (/2nd leg|second leg/i.test(text)) return "Rückspiel";
    return "";
}

// Saison von Juli bis Juni
function seasonRange() {
    let now = new Date();
    let year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    let from = new Date(year, 6, 1);
    let to = new Date(Math.max(new Date(year + 1, 5, 30).getTime(), now.getTime() + 120 * 86400000));
    return { from, to };
}

// Alle Spiele des Wettbewerbs in der laufenden Saison (einmal geladen).
// ESPN lehnt Datumsbereiche ("20261001-20261031") inzwischen ab – ganze Monate ("202610") und
// Jahre ("2026") gehen. Je Monat wird daher zuerst das Monatsformat probiert, zuletzt der Bereich.
let SEASON_EVENTS = null;
let SCOREBOARD_ERROR = "";

async function loadRange(base, from, to) {
    let month = `${from.getFullYear()}${String(from.getMonth() + 1).padStart(2, "0")}`;
    let range = `${ymd(from)}-${ymd(to)}`;
    for (let query of [`dates=${month}&limit=200`, `dates=${month}`, `dates=${range}&limit=200`]) {
        let json = await loadJSON(`${base}?${query}`).catch(e => {
            if (!SCOREBOARD_ERROR) SCOREBOARD_ERROR = String(e.message || e);
            return null;
        });
        if (json && Array.isArray(json.events)) return json.events;
        if (json && json.message && !SCOREBOARD_ERROR) SCOREBOARD_ERROR = `${json.code || ""} ${json.message}`.trim();
    }
    return [];
}

// Notlösung: ganze Kalenderjahre der Saison
async function loadYears(base, from, to) {
    let years = [...new Set([from.getFullYear(), to.getFullYear()])];
    let lists = await Promise.all(years.map(y => loadJSON(`${base}?dates=${y}&limit=1000`).catch(() => null)));
    return lists.flatMap(json => (json && json.events) || [])
        .filter(e => new Date(e.date) >= from && new Date(e.date) <= to);
}

async function loadSeasonEvents() {
    if (SEASON_EVENTS) return SEASON_EVENTS;
    let { from, to } = seasonRange();
    let until = new Date(Math.min(to.getTime(), Date.now() + 90 * 86400000));
    let months = [];
    for (let d = new Date(from); d <= until; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        months.push([new Date(d), new Date(d.getFullYear(), d.getMonth() + 1, 0)]);
    }
    let base = `site/v2/sports/soccer/${LEAGUE.slug}/scoreboard`;
    let lists = await Promise.all(months.map(([a, b]) => loadRange(base, a, b)));
    let events = mergeEvents(lists);
    if (!events.length) {
        DIAG.push(`Scoreboard ${months.length} Monate: 0 Spiele${SCOREBOARD_ERROR ? " · " + SCOREBOARD_ERROR.slice(0, 80) : ""}`);
        events = mergeEvents([await loadYears(base, from, until)]);
        DIAG.push(`Scoreboard Jahre: ${events.length} Spiele`);
    }
    if (!events.length) {
        // Notlösung: aktueller Spieltag
        let current = await loadJSON(base).catch(() => null);
        events = mergeEvents([(current && current.events) || []]);
        DIAG.push(`Scoreboard aktuell: ${events.length} Spiele`);
    }
    SEASON_EVENTS = events;
    return SEASON_EVENTS;
}

// Mehrere Listen zusammenführen, doppelte Spiele entfernen, nach Datum sortieren
function mergeEvents(lists) {
    let byId = {};
    lists.flat().forEach(e => { if (e && e.id) byId[e.id] = e; });
    return Object.values(byId).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Spiele des eigenen Teams: aus dem Scoreboard und zusätzlich aus dem Team-Spielplan
async function loadGames() {
    let fromBoard = (await loadSeasonEvents()).filter(involvesTeam);
    let teamBase = `site/v2/sports/soccer/${LEAGUE.slug}/teams/${TEAM_ID}/schedule`;
    let [results, fixtures] = await Promise.all([
        loadJSON(teamBase).catch(() => null),
        loadJSON(`${teamBase}?fixture=true`).catch(() => null),
    ]);
    let fromSchedule = [results, fixtures].map(json => ((json && json.events) || []).filter(involvesTeam));
    let games = mergeEvents([fromBoard].concat(fromSchedule));
    if (!games.length) {
        DIAG.push(`Team ${TEAM_ID}: Scoreboard ${fromBoard.length}, Spielplan ${fromSchedule[0].length}/${fromSchedule[1].length}`);
    }
    return games;
}

// Spieltag = wievieltes Spiel der Heimmannschaft in dieser Phase
function matchdayOf(event, all) {
    let home = event.competitions[0].competitors.find(c => c.homeAway === "home") || event.competitions[0].competitors[0];
    let phase = roundOf(event);
    let date = new Date(event.date);
    return all.filter(e => roundOf(e) === phase && new Date(e.date) <= date
        && e.competitions[0].competitors.some(c => String(c.team.id) === String(home.team.id))).length;
}

// Alle Gruppen mit Tabelleneinträgen einsammeln
function collectGroups(node, out = []) {
    if (!node) return out;
    if (node.standings && node.standings.entries) out.push(node);
    (node.children || []).forEach(child => collectGroups(child, out));
    return out;
}

function stat(entry, name) {
    let s = (entry.stats || []).find(x => x.name === name || x.type === name);
    return s ? Number(s.value) : 0;
}

// Tabellen-Ausschnitt mit 7 Zeilen:
//   Platz 1–5:  Plätze 1–7
//   sonst:      Platz 1, 2, …, Platz davor, eigenes Team, Platz danach, …
function standingsWindow(rows, pos) {
    if (pos <= 4) return rows.slice(0, 7);
    // Am Tabellenende statt der hinteren Lücke die letzten fünf
    if (pos + 1 >= rows.length - 1) return [rows[0], { gap: true }].concat(rows.slice(-5));
    let before = pos - 1 > 2 ? [{ gap: true }] : [];
    return rows.slice(0, 2).concat(before, rows.slice(pos - 1, pos + 2), [{ gap: true }]);
}

function parseStandings(json) {
    let groups = collectGroups(json).filter(g => g.standings.entries.some(e => String(e.team.id) === TEAM_ID));
    let group = groups.sort((a, b) => a.standings.entries.length - b.standings.entries.length)[0] || collectGroups(json)[0];
    if (!group) return null;
    let rows = group.standings.entries.map((e, i) => ({
        id: String(e.team.id),
        abbr: germanTeam(e.team).abbr,
        logo: logoUrl(e.team),
        rank: stat(e, "rank") || i + 1,
        points: stat(e, "points"),
        played: stat(e, "gamesPlayed"),
        diff: stat(e, "pointDifferential"),
    })).sort((a, b) => a.rank - b.rank);
    let pos = rows.findIndex(r => r.id === TEAM_ID);
    return { rows: standingsWindow(rows, pos), own: pos >= 0 ? rows[pos] : null };
}

async function loadData() {
    let games = await loadGames();
    let finished = games.filter(e => stateOf(e) === "post");
    let liveEvent = games.find(e => stateOf(e) === "in");
    let upcoming = games.filter(e => stateOf(e) === "pre");

    // DFB-Pokal: Runde notfalls über die Reihenfolge der Spiele bestimmen
    let info = e => {
        let g = gameInfo(e);
        if (LEAGUE_KEY === "pokal" && !g.round) g.round = POKAL_ROUNDS[games.indexOf(e)] || "";
        g.leg = legOf(e);
        return g;
    };
    let last = finished.length ? info(finished[finished.length - 1]) : null;
    let form = finished.slice(-5).map(info);
    let live = liveEvent ? { ...info(liveEvent), detail: liveDetail(statusOf(liveEvent)) } : null;
    let next = upcoming.length ? info(upcoming[0]) : null;

    // CL: Nach der Ligaphase statt Tabelle die aktuelle K.-o.-Runde mit Hin- und Rückspiel
    let knockout = null;
    if (LEAGUE_KEY === "cl") {
        let current = live || next || last;
        if (current && current.round && current.round !== "Ligaphase") {
            knockout = { round: current.round, legs: games.map(info).filter(g => g.round === current.round) };
        }
    }

    // Pokal: letzte zwei Spiele, Status und nächste Runde
    let pokal = null;
    if (LEAGUE_KEY === "pokal") {
        let lastTwo = finished.slice(-2).map(info).reverse();
        let status = "aktiv";
        if (!live && !next && last) {
            if (last.result === "N") status = "ausgeschieden";
            else if (last.round === "Finale") status = "sieger";
        }
        let nextRound = next ? next.round : last ? POKAL_ROUNDS[POKAL_ROUNDS.indexOf(last.round) + 1] || "" : POKAL_ROUNDS[0];
        pokal = { lastTwo, status, nextRound };
    }

    let team = null;
    for (let e of games) {
        let c = e.competitions[0].competitors.find(x => String(x.team.id) === TEAM_ID);
        if (c) { team = c.team; break; }
    }

    let standings = null;
    try {
        if (LEAGUE_KEY !== "pokal") standings = parseStandings(await loadJSON(`v2/sports/soccer/${LEAGUE.slug}/standings`));
    } catch (e) {
        console.log(`Tabelle nicht geladen: ${e}`);
    }

    return {
        name: team ? germanTeam(team).name : "FC Bayern",
        logo: team ? logoUrl(team) : null,
        last,
        form,
        live,
        next,
        standings,
        knockout,
        pokal,
    };
}

// Ergebnisse-Ansicht: laufende Spiele zuerst, dann die neuesten Ergebnisse
function toGame(e) {
    let side = homeAway => {
        let c = e.competitions[0].competitors.find(x => x.homeAway === homeAway);
        let german = germanTeam(c.team);
        return { id: String(c.team.id), abbr: german.abbr, logo: logoUrl(c.team), score: score(c), winner: c.winner === true };
    };
    return {
        id: String(e.id),
        date: e.date,
        state: stateOf(e),
        detail: stateOf(e) === "in" ? liveDetail(statusOf(e)) : resultSuffix(e),
        home: side("home"),
        away: side("away"),
    };
}

async function loadResults(count) {
    let all = await loadSeasonEvents();
    let played = all.filter(e => stateOf(e) !== "pre");
    played.sort((a, b) => (stateOf(b) === "in") - (stateOf(a) === "in") || new Date(b.date) - new Date(a.date));
    let shown = played.slice(0, count);
    let games = shown.map(toGame);

    // Überschrift: Spieltag(e) bzw. Runde des neuesten Spiels
    let label = "";
    if (shown.length) {
        let round = roundOf(shown[0]);
        if (!round || round === "Ligaphase") {
            let days = [...new Set(shown.map(e => matchdayOf(e, all)))].sort((a, b) => a - b);
            let span = days.length > 1 ? `${days[0]}.–${days[days.length - 1]}. Spieltag` : `${days[0]}. Spieltag`;
            label = round ? `${round} · ${span}` : span;
        } else {
            label = [round, legOf(shown[0])].filter(Boolean).join(" · ");
        }
    }
    return { label, games };
}

// Spiele nach Spieltag gruppieren: ein Spieltag = Spiele ohne Pause von mehr als 1,5 Tagen
// (Bundesliga Fr–So, CL Di/Mi). Einzelne Nachholspiele (< 3 Spiele) fallen weg.
// Titel: häufigste Spieltagsnummer der Gruppe bzw. Runde und Hin-/Rückspiel
function groupMatchdays(all, minGames = 3) {
    let sorted = all.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let clusters = [];
    let last = 0;
    for (let e of sorted) {
        let t = new Date(e.date).getTime();
        if (!clusters.length || t - last > 1.5 * 86400000) clusters.push([]);
        clusters[clusters.length - 1].push(e);
        last = t;
    }
    return clusters.filter(events => events.length >= minGames).map((events, index) => ({ events, all: sorted, index }));
}

// Titel erst für die angezeigten Spieltage berechnen (Spieltagsnummer zählen ist aufwendig)
function titleGroup(group) {
    let phase = roundOf(group.events[0]);
    // DFB-Pokal: Runde aus ESPN, sonst über die Reihenfolge der Runden in der Saison
    if (LEAGUE_KEY === "pokal") {
        group.title = phase && phase !== "Ligaphase" ? phase : POKAL_ROUNDS[group.index] || "Runde";
        group.phase = "";
        return group;
    }
    if (phase && phase !== "Ligaphase") {
        group.title = [phase, legOf(group.events[0])].filter(Boolean).join(" · ");
        group.phase = "";
        return group;
    }
    let tally = {};
    group.events.forEach(e => { let d = matchdayOf(e, group.all); tally[d] = (tally[d] || 0) + 1; });
    let day = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    group.title = `${day}. Spieltag`;
    group.phase = phase;
    return group;
}

// Großes Widget: CL der ganze aktuelle Spieltag, Bundesliga der letzte und der nächste
// (läuft ein Spieltag noch, der vorige und der laufende)
async function loadMatchdays() {
    let pokal = LEAGUE_KEY === "pokal";
    let groups = groupMatchdays(await loadSeasonEvents(), pokal ? 1 : 3);
    let current = -1;
    groups.forEach((g, i) => { if (g.events.some(e => stateOf(e) !== "pre")) current = i; });
    if (current < 0) current = 0;
    let picked;
    if (LEAGUE_KEY === "cl") {
        picked = [groups[current]];
    } else if (pokal) {
        // Runde beendet und die nächste schon ausgelost (Spiele angesetzt): Vorschau auf die nächste
        let done = groups[current] && groups[current].events.every(e => stateOf(e) === "post");
        picked = [done && groups[current + 1] ? groups[current + 1] : groups[current]];
    } else {
        let running = groups[current] && groups[current].events.some(e => stateOf(e) !== "post");
        picked = running ? [groups[current - 1], groups[current]] : [groups[current], groups[current + 1]];
    }
    picked = picked.filter(Boolean).map(titleGroup);
    let sections = picked.map(g => ({
        title: g.title,
        games: g.events.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(toGame),
    }));
    let label = "";
    if (sections.length === 1) {
        let phase = picked[0].phase;
        label = phase ? `${phase} · ${sections[0].title}` : sections[0].title;
    } else if (sections.length > 1) {
        label = `${sections[0].title.replace(". Spieltag", ".")}–${sections[1].title}`;
    }
    return { label, sections, games: sections.flatMap(sec => sec.games) };
}

async function loadWithCache(count) {
    try {
        if (VIEW === "ergebnisse") {
            let data = COMPACT ? await loadResults(count) : await loadMatchdays();
            if (data.games.length) {
                data.updated = Date.now();
                fm.writeString(cachePath, JSON.stringify(data));
                return data;
            }
            throw new Error("Keine Ergebnisse gefunden");
        }
        let data = await loadData();
        if (data.last || data.next || data.live || LEAGUE_KEY === "pokal") {
            data.updated = Date.now();
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
        DIAG.push("Keine Spiele gefunden");
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
        DIAG.push(`Fehler: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        if (data.updated) UPDATED = data.updated;
        return data;
    }
    return null;
}


// ESPN-Logos sind 500×500 px – auf dem Homescreen reicht der Speicher dafür nicht.
// Über den ESPN-Bildserver in 64 px laden.
function smallLogo(url) {
    let m = /^https?:\/\/a\.espncdn\.com(\/i\/[^?]+)/.exec(url || "");
    return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=64&h=64` : url;
}

async function loadLogos(urls) {
    let images = {};
    await Promise.all([...new Set(urls.filter(Boolean))].map(async url => {
        try {
            images[url] = await new Request(smallLogo(url)).loadImage();
        } catch (e) {
            console.log(`Logo nicht geladen: ${url}`);
        }
    }));
    return images;
}

const WHITE = Color.white();
const LIVE_RED = new Color("#FFB4AB");
const ACCENT = new Color("#FFE08A");
const RESULT_COLORS = { S: new Color("#34C759"), N: new Color("#FF453A"), U: new Color("#8E8E93") };

function addLabel(stack, text, font, color, opacity = 1) {
    let t = stack.addText(text);
    t.font = font;
    t.textColor = color;
    t.textOpacity = opacity;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.7;
    return t;
}

function addLogo(stack, images, url, size) {
    if (images[url]) {
        let img = stack.addImage(images[url]);
        img.imageSize = new Size(size, size);
    } else {
        stack.addSpacer(size);
    }
}

function formatKickoff(dateString) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "EE dd.MM. · HH:mm";
    return df.string(new Date(dateString));
}

function formatDay(dateString) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "dd.MM.";
    return df.string(new Date(dateString));
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = LEAGUE.colors.map(c => new Color(c));
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addSectionTitle(stack, text, color = WHITE, opacity = 0.6) {
    addLabel(stack, text.toUpperCase(), Font.semiboldSystemFont(10), color, opacity);
}

function addBadge(stack, result, size) {
    let badge = stack.addStack();
    badge.size = new Size(size, size);
    badge.backgroundColor = RESULT_COLORS[result] || RESULT_COLORS.U;
    badge.cornerRadius = 4;
    badge.centerAlignContent();
    addLabel(badge, result || "–", Font.boldSystemFont(size * 0.65), WHITE);
}

// Letztes Spiel groß: Badge, Ergebnis, daneben Gegner und Datum
function addLastGame(stack, last, images, compact = false) {
    addSectionTitle(stack, "Letztes Spiel");
    stack.addSpacer(2);
    if (!last) {
        addLabel(stack, "–", Font.mediumSystemFont(13), WHITE, 0.7);
        return;
    }
    let row = stack.addStack();
    row.centerAlignContent();
    addBadge(row, last.result, 22);
    row.addSpacer(8);
    addLabel(row, `${last.ourScore}:${last.theirScore}`, Font.boldRoundedSystemFont(compact ? 24 : 28), WHITE);
    let info;
    if (compact) {
        info = stack.addStack();
    } else {
        row.addSpacer(8);
        info = row.addStack();
    }
    info.layoutVertically();
    let opponent = info.addStack();
    opponent.centerAlignContent();
    addLabel(opponent, last.home ? "vs" : "@", Font.mediumSystemFont(11), WHITE, 0.6);
    opponent.addSpacer(3);
    addLogo(opponent, images, last.opponentLogo, 16);
    opponent.addSpacer(3);
    addLabel(opponent, last.opponent, Font.semiboldSystemFont(12), WHITE);
    addLabel(info, formatDay(last.date), Font.mediumSystemFont(10), WHITE, 0.6);
}

// Form klein: Gegner-Logo über S/U/N-Badge, ältestes Spiel links, neuestes rechts
function addForm(stack, data, images) {
    let form = data.form || [];
    if (!form.length) return;
    let row = stack.addStack();
    row.centerAlignContent();
    form.forEach((game, i) => {
        if (i > 0) row.addSpacer(3);
        let item = row.addStack();
        item.layoutVertically();
        let logo = item.addStack();
        logo.addSpacer(1);
        addLogo(logo, images, game.opponentLogo, 11);
        item.addSpacer(1);
        addBadge(item, game.result, 13);
    });
}

// Live-Spielstand: eigener Score groß, Halbzeit und Minute farbig
function addLiveGame(stack, live, images) {
    addSectionTitle(stack, "● Live", LIVE_RED, 1);
    stack.addSpacer(2);
    let row = stack.addStack();
    row.centerAlignContent();
    addLabel(row, `${live.ourScore || 0}:${live.theirScore || 0}`, Font.boldRoundedSystemFont(22), WHITE);
    row.addSpacer(8);
    addLabel(row, live.home ? "vs" : "@", Font.mediumSystemFont(11), WHITE, 0.6);
    row.addSpacer(3);
    addLogo(row, images, live.opponentLogo, 16);
    row.addSpacer(3);
    addLabel(row, live.opponent, Font.semiboldSystemFont(12), WHITE);
    addLabel(stack, live.detail, Font.semiboldSystemFont(10), LIVE_RED);
}

function addNextGame(stack, next, images) {
    addSectionTitle(stack, "Nächstes Spiel");
    stack.addSpacer(3);
    if (!next) {
        addLabel(stack, "Noch kein Termin", Font.mediumSystemFont(13), WHITE, 0.7);
        return;
    }
    let row = stack.addStack();
    row.centerAlignContent();
    addLabel(row, next.home ? "vs" : "@", Font.mediumSystemFont(13), WHITE, 0.6);
    row.addSpacer(4);
    addLogo(row, images, next.opponentLogo, 20);
    row.addSpacer(4);
    addLabel(row, next.opponentName, Font.semiboldSystemFont(14), WHITE);
    addLabel(stack, formatKickoff(next.date), Font.mediumSystemFont(10), WHITE, 0.6);
}

// 7 Zeilen: kompakt, damit sie ins mittlere Widget passen; Lücken als „···“
function addStandings(stack, data, images) {
    let standings = data.standings;
    addSectionTitle(stack, LEAGUE.table);
    stack.addSpacer(2);
    if (!standings) {
        addLabel(stack, "–", Font.mediumSystemFont(11), WHITE, 0.7);
        return;
    }
    standings.rows.forEach((r, i) => {
        if (i > 0) stack.addSpacer(1);
        if (r.gap) {
            let gap = stack.addStack();
            gap.addSpacer(4);
            addLabel(gap, "···", Font.boldSystemFont(8), WHITE, 0.5);
            return;
        }
        let mine = r.id === TEAM_ID;
        let row = stack.addStack();
        row.centerAlignContent();
        if (mine) {
            row.backgroundColor = new Color("#ffffff", 0.18);
            row.cornerRadius = 4;
        }
        row.setPadding(0, 3, 0, 3);
        let rank = row.addStack();
        rank.size = new Size(14, 0);
        addLabel(rank, `${r.rank}`, Font.mediumMonospacedSystemFont(10), WHITE, 0.6);
        row.addSpacer(3);
        addLogo(row, images, r.logo, 11);
        row.addSpacer(3);
        addLabel(row, r.abbr, mine ? Font.boldSystemFont(10) : Font.mediumSystemFont(10), mine ? ACCENT : WHITE);
        row.addSpacer();
        // Schmale Spalten: Tordifferenz und Punkte, jeweils rechtsbündig
        let diff = row.addStack();
        diff.size = new Size(24, 0);
        diff.addSpacer();
        addLabel(diff, r.diff > 0 ? `+${r.diff}` : `${r.diff}`, Font.mediumMonospacedSystemFont(9), WHITE, 0.55);
        let points = row.addStack();
        points.size = new Size(20, 0);
        points.addSpacer();
        addLabel(points, `${r.points}`, Font.semiboldMonospacedSystemFont(10), WHITE, 0.9);
    });
}

// CL nach der Ligaphase: Runde mit Hin- und Rückspiel statt Tabelle
function addKnockout(stack, data, images) {
    addSectionTitle(stack, data.knockout.round);
    data.knockout.legs.forEach(leg => {
        stack.addSpacer(5);
        addLabel(stack, leg.leg || formatDay(leg.date), Font.semiboldSystemFont(9), WHITE, 0.55);
        stack.addSpacer(1);
        let row = stack.addStack();
        row.centerAlignContent();
        if (leg.result) {
            addBadge(row, leg.result, 15);
            row.addSpacer(5);
            addLabel(row, `${leg.ourScore}:${leg.theirScore}`, Font.boldRoundedSystemFont(14), WHITE);
        } else {
            addLabel(row, formatDay(leg.date), Font.semiboldSystemFont(12), WHITE, 0.85);
        }
        row.addSpacer(5);
        addLabel(row, leg.home ? "vs" : "@", Font.mediumSystemFont(10), WHITE, 0.6);
        row.addSpacer(3);
        addLogo(row, images, leg.opponentLogo, 14);
        row.addSpacer(3);
        addLabel(row, leg.opponent, Font.semiboldSystemFont(11), WHITE);
        if (leg.suffix) {
            row.addSpacer(3);
            addLabel(row, leg.suffix, Font.mediumSystemFont(9), WHITE, 0.6);
        }
    });
}

// Ergebnisse-Ansicht: Heim oben, Gast unten; Bayern hervorgehoben, laufende Spiele mit Minute
// Mittleres Ergebnis-Widget: etwas kleinere Zeilen, damit alles samt Kopfzeile passt
let COMPACT = false;

function addResultLine(stack, team, game, images) {
    let row = stack.addStack();
    row.centerAlignContent();
    addLogo(row, images, team.logo, COMPACT ? 13 : 14);
    row.addSpacer(4);
    let mine = team.id === TEAM_ID;
    let loser = game.state === "post" && !team.winner && (game.home.winner || game.away.winner);
    addLabel(row, team.abbr, team.winner || mine ? Font.boldSystemFont(COMPACT ? 11 : 12) : Font.mediumSystemFont(COMPACT ? 11 : 12), mine ? ACCENT : WHITE, loser ? 0.55 : 1);
    row.addSpacer();
    addLabel(row, team.score, team.winner ? Font.boldMonospacedSystemFont(COMPACT ? 11 : 12) : Font.mediumMonospacedSystemFont(COMPACT ? 11 : 12), WHITE, loser ? 0.55 : 1);
}

function addResult(stack, game, images) {
    let box = stack.addStack();
    box.layoutVertically();
    box.url = `https://www.espn.com/soccer/match/_/gameId/${game.id}`;
    addResultLine(box, game.home, game, images);
    box.addSpacer(1);
    addResultLine(box, game.away, game, images);
    if (game.state === "in") {
        box.addSpacer(1);
        addLabel(box, `● ${game.detail}`, Font.semiboldSystemFont(9), LIVE_RED);
    } else if (game.detail) {
        box.addSpacer(1);
        addLabel(box, game.detail, Font.mediumSystemFont(9), WHITE, 0.55);
    }
}

function buildResults(widget, data, columns, perColumn, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, `⚽️ ${LEAGUE.title}`, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = [data.label, data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);

    widget.addSpacer(COMPACT ? 5 : 8);

    let games = data.games.slice(0, columns * perColumn);
    let row = widget.addStack();
    for (let c = 0; c < columns; c++) {
        if (c > 0) row.addSpacer(columns > 2 ? 12 : 18);
        let col = row.addStack();
        col.layoutVertically();
        games.slice(c * perColumn, (c + 1) * perColumn).forEach((game, i) => {
            if (i > 0) col.addSpacer(COMPACT ? 3 : 6);
            addResult(col, game, images);
        });
        col.addSpacer();
    }
    widget.addSpacer();
}

// Eine Zeile je Spiel: Logo Heim · Ergebnis bzw. Anstoßzeit · Gast Logo (der Tag steht darüber)
function addGameRow(stack, game, images) {
    let row = stack.addStack();
    row.centerAlignContent();
    row.url = `https://www.espn.com/soccer/match/_/gameId/${game.id}`;
    let played = game.state !== "pre";
    let draw = played && !game.home.winner && !game.away.winner;
    let teamFont = team => (!played || draw ? Font.semiboldSystemFont(13)
        : team.winner ? Font.boldSystemFont(13) : Font.mediumSystemFont(13));
    let teamOpacity = team => (played && !draw && !team.winner && game.state === "post" ? 0.55 : 1);

    addLogo(row, images, game.home.logo, 15);
    row.addSpacer(3);
    let home = row.addStack();
    home.size = new Size(35, 0);
    addLabel(home, game.home.abbr, teamFont(game.home), WHITE, teamOpacity(game.home));
    home.addSpacer();

    let mid = row.addStack();
    mid.size = new Size(42, 0);
    mid.addSpacer();
    if (game.state === "pre") {
        let df = new DateFormatter();
        df.dateFormat = "HH:mm";
        addLabel(mid, df.string(new Date(game.date)), Font.semiboldMonospacedSystemFont(10), WHITE, 0.7).minimumScaleFactor = 0.8;
    } else {
        addLabel(mid, `${game.home.score}:${game.away.score}`, Font.boldRoundedSystemFont(13),
            game.state === "in" ? LIVE_RED : WHITE);
    }
    mid.addSpacer();

    let away = row.addStack();
    away.size = new Size(35, 0);
    away.addSpacer();
    addLabel(away, game.away.abbr, teamFont(game.away), WHITE, teamOpacity(game.away));
    row.addSpacer(3);
    addLogo(row, images, game.away.logo, 15);
}

// "SA 31.10." – Tag als Zwischenzeile
function dayKey(date) {
    let d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayTitle(date) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "EE dd.MM.";
    return df.string(new Date(date)).replace(".", "").toUpperCase();
}

// Ein Spieltag auf zwei Spalten: ganze Tage zusammenhalten (CL: Di | Mi), sonst halbieren
function splitByDay(games) {
    let days = [];
    games.forEach(g => {
        let last = days[days.length - 1];
        if (last && last.key === dayKey(g.date)) last.games.push(g);
        else days.push({ key: dayKey(g.date), games: [g] });
    });
    let left = [], right = [];
    for (let day of days) {
        if (left.length < games.length / 2 && left.length + day.games.length <= Math.ceil(games.length / 2) + 2) left.push(...day.games);
        else right.push(...day.games);
    }
    if (!left.length || !right.length) {
        let half = Math.ceil(games.length / 2);
        return [games.slice(0, half), games.slice(half)];
    }
    return [left, right];
}

// Großes Widget: ganze Spieltage, zwei Spalten. Zeilenabstand füllt die Höhe
function buildMatchdays(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, `⚽️ ${LEAGUE.title}`, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let more = data.sections.length === 1 ? data.sections[0].games.length - 18 : 0;
    let info = [data.label, more > 0 ? `+${more} weitere` : "", data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);
    widget.addSpacer(10);

    let columns;
    if (data.sections.length > 1) {
        columns = data.sections.slice(0, 2).map(sec => ({ title: sec.title, games: sec.games.slice(0, 10) }));
    } else {
        columns = splitByDay(data.sections[0].games.slice(0, 18)).map(games => ({ games }));
    }

    // Höhe: Titel 18, Tageszeile 17, Spielzeile 17 – der Rest (Budget ~290) als Abstand zwischen den Spielen
    let layout = columns.map(column => {
        let days = new Set(column.games.map(g => dayKey(g.date))).size;
        return { fixed: (column.title ? 18 : 0) + days * 15 + column.games.length * 17, rows: column.games.length };
    });
    let gap = Math.max(4, Math.min(22, Math.min(...layout.map(l => (290 - l.fixed) / Math.max(1, l.rows - 1)))));

    let row = widget.addStack();
    columns.forEach((column, c) => {
        if (c > 0) row.addSpacer(); // Spalten fest breit, der Rest ist Abstand in der Mitte
        let col = row.addStack();
        col.layoutVertically();
        if (column.title) {
            addLabel(col, column.title.toUpperCase(), Font.semiboldSystemFont(10), WHITE, 0.55);
            col.addSpacer(4);
        }
        let lastDay = null;
        column.games.forEach((game, i) => {
            if (dayKey(game.date) !== lastDay) {
                if (i > 0) col.addSpacer(gap);
                addLabel(col, dayTitle(game.date), Font.semiboldSystemFont(9), ACCENT, 0.8);
                col.addSpacer(4);
                lastDay = dayKey(game.date);
            } else {
                col.addSpacer(gap);
            }
            addGameRow(col, game, images);
        });
        col.addSpacer();
    });
    widget.addSpacer();
}

// DFB-Pokal: links die letzten zwei Spiele, rechts die nächste Runde
function addPokalGame(stack, game, images) {
    addLabel(stack, game.round || formatDay(game.date), Font.semiboldSystemFont(9), WHITE, 0.55);
    stack.addSpacer(1);
    let row = stack.addStack();
    row.centerAlignContent();
    addBadge(row, game.result, 18);
    row.addSpacer(6);
    addLabel(row, `${game.ourScore}:${game.theirScore}`, Font.boldRoundedSystemFont(20), WHITE);
    if (game.suffix) {
        row.addSpacer(4);
        addLabel(row, game.suffix, Font.semiboldSystemFont(9), WHITE, 0.7);
    }
    row.addSpacer(6);
    addLabel(row, game.home ? "vs" : "@", Font.mediumSystemFont(10), WHITE, 0.6);
    row.addSpacer(3);
    addLogo(row, images, game.opponentLogo, 15);
    row.addSpacer(3);
    addLabel(row, game.opponent, Font.semiboldSystemFont(11), WHITE);
}

function addPokalNext(stack, data, images) {
    let pokal = data.pokal;
    if (data.live) {
        addLiveGame(stack, data.live, images);
        return;
    }
    if (pokal.status === "sieger") {
        addSectionTitle(stack, "Saison");
        stack.addSpacer(4);
        let row = stack.addStack();
        row.centerAlignContent();
        let trophy = SFSymbol.named("trophy.fill");
        trophy.applyFont(Font.systemFont(22));
        let img = row.addImage(trophy.image);
        img.imageSize = new Size(22, 22);
        img.tintColor = ACCENT;
        row.addSpacer(6);
        addLabel(row, "Pokalsieger", Font.boldSystemFont(15), ACCENT);
        return;
    }
    if (pokal.status === "ausgeschieden") {
        addSectionTitle(stack, "Ausgeschieden");
        stack.addSpacer(4);
        addLabel(stack, data.last.round || "", Font.semiboldSystemFont(15), WHITE);
        addLabel(stack, `gegen ${data.last.opponentName}`, Font.mediumSystemFont(11), WHITE, 0.7);
        return;
    }
    addSectionTitle(stack, "Nächste Runde");
    stack.addSpacer(3);
    addLabel(stack, pokal.nextRound || "–", Font.boldSystemFont(15), WHITE);
    stack.addSpacer(3);
    if (data.next) {
        let row = stack.addStack();
        row.centerAlignContent();
        addLabel(row, data.next.home ? "vs" : "@", Font.mediumSystemFont(11), WHITE, 0.6);
        row.addSpacer(4);
        addLogo(row, images, data.next.opponentLogo, 18);
        row.addSpacer(4);
        addLabel(row, data.next.opponentName, Font.semiboldSystemFont(13), WHITE);
        addLabel(stack, formatKickoff(data.next.date), Font.mediumSystemFont(10), WHITE, 0.6);
    } else {
        addLabel(stack, "Gegner wird ausgelost", Font.mediumSystemFont(11), WHITE, 0.7);
    }
}

function buildPokal(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    let cup = SFSymbol.named("trophy.fill");
    cup.applyFont(Font.systemFont(16));
    let cupImg = header.addImage(cup.image);
    cupImg.imageSize = new Size(18, 18);
    cupImg.tintColor = ACCENT;
    header.addSpacer(6);
    addLabel(header, "DFB-Pokal", Font.semiboldSystemFont(15), WHITE);
    header.addSpacer(8);
    addLogo(header, images, data.logo, 18);
    header.addSpacer();
    if (data.stale) addLabel(header, "offline", Font.semiboldSystemFont(10), WHITE, 0.6);

    widget.addSpacer(8);

    let body = widget.addStack();
    let left = body.addStack();
    left.layoutVertically();
    addSectionTitle(left, "Letzte Spiele");
    if (!data.pokal.lastTwo.length) {
        left.addSpacer(3);
        addLabel(left, "Noch kein Spiel", Font.mediumSystemFont(12), WHITE, 0.7);
    }
    data.pokal.lastTwo.forEach(game => {
        left.addSpacer(5);
        addPokalGame(left, game, images);
    });
    left.addSpacer();

    body.addSpacer(12);
    body.addSpacer();

    let right = body.addStack();
    right.layoutVertically();
    right.size = new Size(120, 0);
    addPokalNext(right, data, images);
    right.addSpacer();
}

function buildMedium(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLogo(header, images, data.logo, 22);
    header.addSpacer(6);
    addLabel(header, data.name, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer(10);
    addForm(header, data, images);
    header.addSpacer();
    if (data.stale) {
        addLabel(header, "offline", Font.semiboldSystemFont(10), WHITE, 0.6);
        header.addSpacer(6);
    }

    widget.addSpacer(4);

    let body = widget.addStack();
    let left = body.addStack();
    left.layoutVertically();
    addLastGame(left, data.last, images);
    left.addSpacer(6);
    if (data.live) addLiveGame(left, data.live, images);
    else addNextGame(left, data.next, images);
    left.addSpacer();

    body.addSpacer(14);
    body.addSpacer();

    let right = body.addStack();
    right.layoutVertically();
    right.size = new Size(134, 0);
    if (data.knockout) addKnockout(right, data, images);
    else addStandings(right, data, images);
    right.addSpacer();
}

function buildSmall(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLogo(header, images, data.logo, 20);
    header.addSpacer(5);
    addLabel(header, LEAGUE_KEY === "cl" ? "CL" : "BL", Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    widget.addSpacer(6);
    addLastGame(widget, data.last, images, true);
    widget.addSpacer();
    if (data.live) addLiveGame(widget, data.live, images);
    else addNextGame(widget, data.next, images);
}

function buildError(widget) {
    addLabel(widget, `⚽️ ${LEAGUE.title}`, Font.semiboldSystemFont(15), WHITE);
    widget.addSpacer(6);
    addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(13), WHITE, 0.8);
    widget.addSpacer(6);
    DIAG.slice(0, 4).forEach(line => {
        let t = addLabel(widget, line, Font.regularMonospacedSystemFont(10), WHITE, 0.6);
        t.lineLimit = 2;
    });
    widget.addSpacer();
}

// Live: alle 5 Minuten. Spieltag vor dem Anpfiff: zum Anpfiff. Sonst stündlich.
function nextRefresh(data) {
    let minute = 60 * 1000;
    let now = Date.now();
    if (data && data.games) {
        let live = data.games.some(g => g.state === "in") && !data.stale;
        if (live) return new Date(now + 5 * minute);
        // Nächster Anstoß innerhalb der nächsten halben Stunde: dann aktualisieren
        let kickoffs = data.games.filter(g => g.state === "pre").map(g => new Date(g.date).getTime()).filter(t => t > now);
        let soon = Math.min(...kickoffs, now + 30 * minute);
        return new Date(Math.max(soon, now + 5 * minute));
    }
    if (data && data.live && !data.stale) return new Date(now + 5 * minute);
    if (data && data.next) {
        let kickoff = new Date(data.next.date).getTime();
        if (kickoff > now && kickoff - now < 60 * minute) return new Date(Math.max(kickoff, now + 5 * minute));
        if (kickoff <= now && now - kickoff < 3 * 60 * minute) return new Date(now + 5 * minute);
    }
    return new Date(now + 60 * minute);
}

async function createWidget() {
    let large = config.widgetFamily === "large" || config.widgetFamily === "extraLarge";
    let columns = large ? 2 : 3;
    let perColumn = large ? 7 : 3;
    COMPACT = !large;

    let data = await loadWithCache(columns * perColumn);
    let widget = new ListWidget();
    widget.url = VIEW === "ergebnisse" ? `https://www.espn.com/soccer/scoreboard/_/league/${LEAGUE.slug}` : LEAGUE.url;
    widget.refreshAfterDate = nextRefresh(data);
    background(widget);
    widget.setPadding(VIEW === "ergebnisse" ? (COMPACT ? 12 : 16) : 12, 16, 4, 16);

    if (!data) {
        buildError(widget);
        return widget;
    }

    let urls = [data.logo];
    if (VIEW === "ergebnisse") {
        data.games.slice(0, data.sections && !COMPACT ? 20 : columns * perColumn).forEach(g => urls.push(g.home.logo, g.away.logo));
    }
    if (data.last) urls.push(data.last.opponentLogo);
    (data.form || []).forEach(g => urls.push(g.opponentLogo));
    if (data.next) urls.push(data.next.opponentLogo);
    if (data.live) urls.push(data.live.opponentLogo);
    if (data.standings) data.standings.rows.forEach(r => urls.push(r.logo));
    if (data.knockout) data.knockout.legs.forEach(g => urls.push(g.opponentLogo));
    if (data.pokal) data.pokal.lastTwo.forEach(g => urls.push(g.opponentLogo));
    let images = await loadLogos(urls);

    if (VIEW === "ergebnisse" && !COMPACT && data.sections && data.sections.length) {
        buildMatchdays(widget, data, images);
    } else if (VIEW === "ergebnisse") {
        buildResults(widget, data, columns, perColumn, images);
    } else if (VIEW === "pokal") {
        buildPokal(widget, data, images);
    } else if (config.widgetFamily === "small") {
        buildSmall(widget, data, images);
    } else {
        buildMedium(widget, data, images);
    }
    addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        await widget.presentMedium();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
