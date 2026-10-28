// Fußball mit Fokus FC Bayern. Quelle: ESPN (öffentliche Schnittstelle).
//
// Ansichten (ANSICHT):
//   "team" (Standard): Lieblingsteam in Bundesliga oder CL – letztes Spiel, Form,
//                      nächstes Spiel (am Spieltag live), Tabellen-Ausschnitt bzw. K.-o.-Runde
//   "ergebnisse":      letzte Ergebnisse und laufende Spiele des Wettbewerbs
//   "pokal":           DFB-Pokal – letzte zwei Spiele und nächste Runde
//   "ergebnisse" mit LIGA "pokal": alle Spiele der aktuellen Pokalrunde (bzw. Vorschau auf die ausgeloste nächste)
//   "tabelle":         vollständige Tabelle (großes Widget) – Bundesliga mit allen Spalten,
//                      Europapokale mit 36 Teams in zwei Spalten; Zonen und Lieblingsteams farbig
// Wettbewerb (LIGA): "bundesliga" (Standard), "cl", "el" (Europa League) oder "ecl" (Conference League).
//
// Im Loader per Function("ANSICHT", "LIGA", code)("ergebnisse", "cl")
// oder als Widget-Parameter, z. B. "ergebnisse cl" oder "pokal".

const ESPN = "https://site.api.espn.com/apis/";
const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const VIEW = String((typeof ANSICHT !== "undefined" && ANSICHT) || params.find(p => ["team", "ergebnisse", "pokal", "tabelle"].includes(p)) || "team").toLowerCase();
const LEAGUE_KEY = VIEW === "pokal" ? "pokal"
    : String((typeof LIGA !== "undefined" && LIGA) || params.find(p => ["cl", "el", "ecl", "bundesliga"].includes(p)) || "bundesliga").toLowerCase();
const TEAM_ID = String((typeof TEAM !== "undefined" && TEAM) || "132"); // 132 = FC Bayern München
// Andere Vereine per Function("LIGA", "TEAM", code)("ecl", "489") – z. B. 489 = Hajduk Split

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
    el: {
        slug: "uefa.europa",
        title: "Europa League",
        table: "Ligaphase",
        colors: ["#E8601C", "#2A1206"],
        url: "https://www.espn.com/soccer/standings/_/league/uefa.europa",
    },
    ecl: {
        slug: "uefa.europa.conf",
        title: "Conference League",
        table: "Ligaphase",
        colors: ["#14A06B", "#062B1D"],
        url: "https://www.espn.com/soccer/standings/_/league/uefa.europa.conf",
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
// Europapokale (CL, EL, ECL): Ligaphase mit 36 Teams, danach K.-o.-Runden
const EUROPE = ["cl", "el", "ecl"].includes(LEAGUE_KEY);
// Kürzel für Kopfzeilen
const SHORT = { bundesliga: "BL", cl: "CL", el: "EL", ecl: "ECL", pokal: "DFB" };
const HEADER_NAME = { cl: "UCL", el: "UEL", ecl: "UECL" };

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
    // Kein ESPN-Logo (meist Amateurvereine im DFB-Pokal): später auf Wikipedia suchen
    let name = team.displayName || team.shortDisplayName || team.name;
    return name ? `wiki:${name}` : null;
}

// Vereinslogo aus der deutschen Wikipedia (Bild des Vereinsartikels, 96 px).
// Ergebnisse werden gespeichert; nicht gefundene Logos frühestens nach 7 Tagen erneut gesucht.
const WIKI_LOGOS_PATH = fm.joinPath(fm.cacheDirectory(), "fussball-wikilogos.json");
async function wikiLogo(name, cache) {
    let hit = cache[name];
    if (hit && (hit.url || Date.now() - hit.t < 7 * 86400000)) return hit.url;
    // Der Artikeltitel muss ein markantes Wort des Namens enthalten (sonst z. B. „Schott“ → Crystal Palace),
    // das Bild muss nach Logo aussehen (SVG oder „Logo“/„Wappen“ im Namen, kein Foto)
    let words = name.toLowerCase().split(/[^\p{L}\d]+/u).filter(w => w.length >= 4);
    let fits = page => page.thumbnail && words.some(w => page.title.toLowerCase().includes(w))
        && /\.svg|logo|wappen|emblem|signet/i.test(decodeURIComponent(page.thumbnail.source));
    let url = null;
    let failed = false;
    // Zuletzt nur das längste Wort – hilft bei Tippfehlern im ESPN-Namen („Großaspch“)
    let longest = words.slice().sort((a, b) => b.length - a.length)[0];
    let terms = [`${name} Fußballverein`, `${name} Fußball`];
    if (longest && words.length > 1) terms.push(`${longest} Fußball`);
    for (let term of terms) {
        try {
            let req = new Request("https://de.wikipedia.org/w/api.php?format=json&action=query&generator=search"
                + `&gsrnamespace=0&gsrlimit=3&gsrsearch=${encodeURIComponent(term)}`
                + "&prop=pageimages&piprop=thumbnail&pithumbsize=96");
            req.headers = { "User-Agent": "Scriptable-Fussball-Widget/1.0" };
            req.timeoutInterval = 8;
            let json = await req.loadJSON();
            let pages = Object.values((json.query && json.query.pages) || {}).sort((a, b) => a.index - b.index);
            let page = pages.find(fits);
            if (page) {
                url = page.thumbnail.source;
                break;
            }
        } catch (e) {
            // z. B. zu viele Anfragen – nicht als „kein Logo“ merken, beim nächsten Mal erneut
            console.log(`Wikipedia-Logo ${name}: ${e}`);
            failed = true;
            break;
        }
    }
    if (!failed || url) cache[name] = { url, t: Date.now() };
    return url;
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
    if (EUROPE) {
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
    if (EUROPE) {
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
// Ergebniszeilen haben Platz für drei Buchstaben: "COMO" → "COM", "BODO" → "BOD"
function shortAbbr(abbr) {
    return String(abbr || "").length > 3 ? String(abbr).slice(0, 3) : abbr;
}

function toGame(e) {
    let side = homeAway => {
        let c = e.competitions[0].competitors.find(x => x.homeAway === homeAway);
        let german = germanTeam(c.team);
        return { id: String(c.team.id), abbr: shortAbbr(german.abbr), logo: logoUrl(c.team), score: score(c), winner: c.winner === true };
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
    if (EUROPE) {
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
        if (VIEW === "tabelle") {
            let data = await loadTable();
            if (data.rows.length) {
                data.updated = Date.now();
                fm.writeString(cachePath, JSON.stringify(data));
                return data;
            }
            throw new Error("Keine Tabelle gefunden");
        }
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
// ESPN-Logos sind 500×500 px – zu groß für den Widget-Speicher. Über den ESPN-Bildserver verkleinert
// laden (auch von a1…a4.espncdn.com); in Tabellen werden Logos von anderen Servern weggelassen.
function smallLogo(url, px = 64) {
    let m = /^https?:\/\/a\d?\.espncdn\.com(\/i\/[^?]+)/.exec(url || "");
    return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${px}&h=${px}` : null;
}

async function loadLogos(urls) {
    let images = {};
    let wikiCache = {};
    try {
        if (fm.fileExists(WIKI_LOGOS_PATH)) wikiCache = JSON.parse(fm.readString(WIKI_LOGOS_PATH));
    } catch (e) {}
    let wikiAsked = false;
    // Tabellen mit 36 Teams: kleinere Logos, sonst reicht der Speicher auf dem Homescreen nicht
    let px = VIEW === "tabelle" ? (LEAGUE_KEY === "bundesliga" ? 40 : 32) : 64;
    await Promise.all([...new Set(urls.filter(Boolean))].map(async url => {
        if (url.startsWith("wiki:")) {
            if (VIEW === "tabelle") return;
            wikiAsked = true;
            let found = await wikiLogo(url.slice(5), wikiCache);
            if (!found) return;
            try {
                images[url] = await new Request(found).loadImage();
            } catch (e) {
                console.log(`Logo nicht geladen: ${found}`);
            }
            return;
        }
        let small = smallLogo(url, px);
        if (!small && VIEW === "tabelle") return; // Tabellen: unbekannte (große) Logos weglassen
        small = small || url;
        try {
            images[url] = await new Request(small).loadImage();
        } catch (e) {
            console.log(`Logo nicht geladen: ${url}`);
        }
    }));
    if (wikiAsked) {
        try {
            fm.writeString(WIKI_LOGOS_PATH, JSON.stringify(wikiCache));
        } catch (e) {}
    }
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
    // Tabellen: dunkler Hintergrund mit leichtem Ton des Wettbewerbs, damit die Zonenfarben lesbar bleiben
    gradient.colors = VIEW === "tabelle"
        ? [new Color(LEAGUE.colors[1]), new Color("#0B0E14")]
        : LEAGUE.colors.map(c => new Color(c));
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

    // Feste Breite, Inhalt zentriert – ohne Abstandhalter, die selbst Platz kosten (sonst „15:…“)
    let mid = row.addStack();
    mid.size = new Size(42, 0);
    mid.centerAlignContent();
    let text;
    if (game.state === "pre") {
        let df = new DateFormatter();
        df.dateFormat = "HH:mm";
        text = addLabel(mid, df.string(new Date(game.date)), Font.semiboldMonospacedSystemFont(10), WHITE, 0.7);
    } else {
        text = addLabel(mid, `${game.home.score}:${game.away.score}`, Font.boldRoundedSystemFont(13),
            game.state === "in" ? LIVE_RED : WHITE);
    }
    text.centerAlignText();

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

// ---------- Vollständige Tabelle ----------
// Lieblingsteams (Schrift gold, fett): FC Bayern, Hajduk Split und das per TEAM gewählte
const FAVORITES = new Set(["132", "489", TEAM_ID]);

// ESPN-Zonen (note.description) → Kurzname und Farbe der Platzziffer
const ZONES = [
    [/round of 16/i, "Achtelfinale", "#30D158"],
    [/playoffs? - seeded/i, "Playoffs gesetzt", "#64D2FF"],
    [/playoff/i, "Playoffs", "#BF9BFF"],
    [/eliminat/i, "Aus", "#FF6961"],
    [/^champions league/i, "Champions League", "#64D2FF"],
    [/^europa league/i, "Europa League", "#FF9F0A"],
    [/conference/i, "Conference League", "#30D158"],
    [/relegation play/i, "Relegation", "#FFD60A"],
    [/relegation/i, "Abstieg", "#FF6961"],
];

function zoneOf(note) {
    if (!note || !note.description) return null;
    let hit = ZONES.find(([re]) => re.test(note.description));
    return hit ? { label: hit[1], color: hit[2] } : { label: note.description, color: note.color || "#FFFFFF" };
}

async function loadTable() {
    let path = `v2/sports/soccer/${LEAGUE.slug}/standings`;
    // Zeitstempel in der Adresse: iOS liefert sonst gern eine zwischengespeicherte (alte) Tabelle
    let [json, board] = await Promise.all([
        loadJSON(`${path}?_=${Math.floor(Date.now() / 60000)}`).catch(() => loadJSON(path)),
        // Anstoßzeiten und laufende Spiele des aktuellen Spieltags – bestimmen, wann neu geladen wird
        loadJSON(`site/v2/sports/soccer/${LEAGUE.slug}/scoreboard`).catch(() => null),
    ]);
    let schedule = ((board && board.events) || []).map(e => ({ state: stateOf(e), date: e.date }));
    let group = collectGroups(json).sort((a, b) => b.standings.entries.length - a.standings.entries.length)[0];
    if (!group) return { rows: [] };
    let rows = group.standings.entries.map((e, i) => {
        let german = germanTeam(e.team);
        return {
            id: String(e.team.id),
            name: german.name,
            abbr: shortAbbr(german.abbr),
            logo: logoUrl(e.team),
            rank: stat(e, "rank") || i + 1,
            played: stat(e, "gamesPlayed"),
            wins: stat(e, "wins"),
            ties: stat(e, "ties"),
            losses: stat(e, "losses"),
            goalsFor: stat(e, "pointsFor"),
            goalsAgainst: stat(e, "pointsAgainst"),
            diff: stat(e, "pointDifferential"),
            points: stat(e, "points"),
            zone: zoneOf(e.note),
        };
    }).sort((a, b) => a.rank - b.rank);
    let matchday = Math.max(0, ...rows.map(r => r.played));
    // Europapokal: Ligaphase beendet (8 Spiele je Team) und K.-o.-Runde begonnen → Turnierbaum statt Tabelle
    let bracket = null;
    if (EUROPE && rows.length && rows.every(r => r.played >= 8)) {
        try {
            bracket = buildBracketData(await loadSeasonEvents());
        } catch (e) {
            console.log(`Turnierbaum: ${e}`);
        }
    }
    return { rows, matchday, schedule, bracket };
}

// K.-o.-Runden der Europapokale: [Runde, Kurzname, Anzahl Duelle]
const KO_ROUNDS = [["Playoffs", "Playoffs", 8], ["Achtelfinale", "AF", 8], ["Viertelfinale", "VF", 4],
    ["Halbfinale", "HF", 2], ["Finale", "Finale", 1]];

// Duelle (Hin- und Rückspiel zusammengefasst) je Runde, in Baum-Reihenfolge
function buildBracketData(events) {
    let ties = {};
    for (let e of events) {
        let round = roundOf(e);
        if (!KO_ROUNDS.some(r => r[0] === round)) continue;
        let comps = e.competitions[0].competitors;
        let ids = comps.map(c => String(c.team.id)).sort();
        let key = `${round}|${ids.join("-")}`;
        let g = toGame(e);
        let tie = ties[key] || (ties[key] = { round, teams: [], legs: [] });
        tie.legs.push({ date: e.date, state: g.state, home: g.home, away: g.away });
        for (let side of [g.home, g.away]) {
            let t = tie.teams.find(x => x.id === side.id);
            if (!t) tie.teams.push(t = { id: side.id, abbr: side.abbr, logo: side.logo, goals: 0, advance: false, legWinner: false });
            if (g.state !== "pre") t.goals += Number(side.score) || 0;
            t.legWinner = side.winner; // im letzten Spiel (z. B. nach Elfmeterschießen)
        }
        comps.forEach(c => {
            if (c.advance === true) tie.teams.find(t => t.id === String(c.team.id)).advance = true;
        });
    }
    let all = Object.values(ties).map(tie => {
        tie.legs.sort((a, b) => new Date(a.date) - new Date(b.date));
        let legsNeeded = tie.round === "Finale" ? 1 : 2;
        let states = tie.legs.map(l => l.state);
        let state = states.includes("in") ? "in" : states.every(s => s === "pre") ? "pre"
            : states.every(s => s === "post") && tie.legs.length >= legsNeeded ? "post" : "running";
        let [a, b] = tie.teams;
        let winner = null;
        if (state === "post" && a && b) {
            let adv = tie.teams.find(t => t.advance);
            winner = adv ? adv.id : a.goals !== b.goals ? (a.goals > b.goals ? a.id : b.id)
                : (tie.teams.find(t => t.legWinner) || {}).id || null;
        }
        return { round: tie.round, date: tie.legs[0].date, state, winner,
            teams: tie.teams.map(({ id, abbr, logo, goals }) => ({ id, abbr, logo, goals })) };
    });
    let rounds = KO_ROUNDS.map(([name, short, slots]) => ({
        name, short, slots,
        ties: all.filter(t => t.round === name).sort((a, b) => new Date(a.date) - new Date(b.date)),
    }));
    // Reihenfolge von hinten: Duelle einer Runde stehen bei dem Duell der nächsten Runde, in das ihr Sieger kam
    for (let r = rounds.length - 2; r >= 0; r--) {
        let next = rounds[r + 1].ties;
        if (!next.length) continue;
        let ordered = [];
        next.forEach(t => rounds[r].ties
            .filter(c => !ordered.includes(c) && c.teams.some(x => t.teams.some(y => y.id === x.id)))
            .forEach(c => ordered.push(c)));
        rounds[r].ties.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
        rounds[r].ties = ordered;
    }
    rounds.forEach(r => { r.slots = Math.max(r.slots, r.ties.length); });
    let started = rounds.filter(r => r.ties.some(t => t.state !== "pre"));
    if (!started.length) return null;
    return { rounds, current: started[started.length - 1].name };
}

// Zahlen in Festbreitenschrift, links mit Ziffern-Leerzeichen auf eine feste Zeichenzahl aufgefüllt –
// so stehen sie rechtsbündig untereinander. Alle Zahlen einer Zeile stehen in EINEM Text: jedes
// Element kostet auf dem Homescreen Speicher, bei 36 Zeilen blieb das Widget sonst weiß.
const FIG = "\u2007";
function padCell(text, chars) {
    return String(text).padStart(chars, FIG);
}

// Spalten: [Überschrift, Zeichen, Wert]
function tableColumns(full) {
    let sign = n => (n > 0 ? `+${n}` : `${n}`);
    let cols = [["Sp", 2, r => r.played]];
    if (full) {
        cols.push(["S", 2, r => r.wins], ["U", 2, r => r.ties], ["N", 2, r => r.losses],
            // Tore am Doppelpunkt ausgerichtet: " 6:16", "25:6 "
            ["Tore", 5, r => `${String(r.goalsFor).padStart(2, FIG)}:${String(r.goalsAgainst).padEnd(2, FIG)}`],
            ["Diff", 4, r => sign(r.diff)]);
    } else {
        cols.push(["+/-", 3, r => sign(r.diff)]);
    }
    return cols;
}

// Zahlenspalten (ohne Punkte) als eine Zeichenkette; Abstand: ein Zeichen
function numberText(cols, pick) {
    return cols.map(col => padCell(pick(col), col[1])).join(" ");
}

const NUM_SIZE = 10.5;

function addTableRow(stack, r, images, full) {
    let fav = FAVORITES.has(r.id);
    let row = stack.addStack();
    row.centerAlignContent();
    if (fav) {
        row.backgroundColor = new Color("#FFE08A", 0.14);
        row.cornerRadius = 4;
    }
    row.setPadding(0, 2, 0, 2);
    let rank = addLabel(row, padCell(r.rank, 2) + " ", Font.semiboldMonospacedSystemFont(NUM_SIZE),
        r.zone ? new Color(r.zone.color) : WHITE, r.zone ? 1 : 0.6);
    rank.minimumScaleFactor = 1;
    addLogo(row, images, r.logo, 13);
    // Name in fester Breite, damit er nicht von den Zahlenspalten zusammengedrückt wird
    let nameBox = row.addStack();
    nameBox.size = new Size(full ? 86 : 38, 0);
    nameBox.setPadding(0, 4, 0, 0);
    let size = full ? 11 : 10.5;
    let name = addLabel(nameBox, full ? r.name : r.abbr, fav ? Font.boldSystemFont(size) : Font.mediumSystemFont(size), fav ? ACCENT : WHITE);
    name.minimumScaleFactor = full ? 0.85 : 1;
    nameBox.addSpacer();
    row.addSpacer();
    if (full) {
        let num = Font.regularMonospacedSystemFont(NUM_SIZE);
        tableColumns(true).forEach(col => addLeagueCell(row, col[0], String(col[2](r)), num, WHITE, 0.7));
        addLeagueCell(row, "Pkt", String(r.points), Font.boldMonospacedSystemFont(NUM_SIZE), fav ? ACCENT : WHITE, 1);
        return;
    }
    addNumbers(row, full, col => col[2](r), WHITE, 0.7, padCell(r.points, 3), fav ? ACCENT : WHITE, 1);
}

// Liga-Tabelle: feste Spaltenbreiten (Inhalt + 7 pt Abstand links), Inhalt rechtsbündig,
// „Tore“ (am Doppelpunkt ausgerichtet) mittig – Überschrift und Zahlen stehen genau übereinander
const LEAGUE_COLUMNS = { Sp: 14, S: 14, U: 14, N: 14, Tore: 33, Diff: 22, Pkt: 20 };
const LEAGUE_GAP = 7;
function addLeagueCell(row, column, text, font, color, opacity) {
    let cell = row.addStack();
    cell.size = new Size(LEAGUE_COLUMNS[column] + LEAGUE_GAP, 0);
    if (column === "Tore") {
        cell.layoutVertically();
        cell.setPadding(0, LEAGUE_GAP, 0, 0);
        cell.centerAlignContent();
    } else {
        // Rechtsbündig: flexibler Abstand davor (mind. ~8 pt – der Spaltenabstand liegt mit darin)
        cell.addSpacer();
    }
    let t = addLabel(cell, text, font, color, opacity);
    t.minimumScaleFactor = 1;
    t.lineLimit = 1;
}

// Zahlenspalten in einem Text, dann die Punkte (fett)
function addNumbers(row, full, pick, color, opacity, points, pointsColor, pointsOpacity) {
    let num = Font.regularMonospacedSystemFont(NUM_SIZE);
    addLabel(row, numberText(tableColumns(full), pick) + " ", num, color, opacity).minimumScaleFactor = 1;
    addLabel(row, points, Font.boldMonospacedSystemFont(NUM_SIZE), pointsColor, pointsOpacity).minimumScaleFactor = 1;
}

// Überschriften in derselben Schrift(-größe) wie die Zahlen, damit die Spalten genau passen
function addTableHeader(stack, full) {
    let row = stack.addStack();
    row.setPadding(0, 2, 0, 2);
    if (full) {
        // Bundesliga: kleine Überschriften über den festen Spalten
        let font = Font.semiboldSystemFont(9);
        addLabel(row, " #", font, WHITE, 0.45).minimumScaleFactor = 1;
        row.addSpacer();
        tableColumns(true).forEach(col => addLeagueCell(row, col[0], col[0], font, WHITE, 0.45));
        addLeagueCell(row, "Pkt", "Pkt", font, WHITE, 0.45);
        return;
    }
    addLabel(row, padCell("#", 2), Font.regularMonospacedSystemFont(NUM_SIZE), WHITE, 0.45).minimumScaleFactor = 1;
    row.addSpacer();
    // Überschrift über einstelligen Zahlen rechtsbündig, „Tore“ mittig über dem Doppelpunkt
    addNumbers(row, full, col => col[0] === "Tore" ? "Tore" + FIG : col[0], WHITE, 0.45, "Pkt", WHITE, 0.45);
}

// Größe des großen Widgets (Punkte) je nach iPhone-Breite
function largeWidgetSize() {
    let w = Device.screenSize().width;
    if (w >= 428) return new Size(364, 382);
    if (w >= 390) return new Size(338, 354);
    if (w >= 375) return new Size(329, 345);
    return new Size(292, 311);
}

// Turnierbaum: je Runde eine Spalte; jedes Duell mittig in seinem Feld, so liegen die Duelle
// einer Runde genau zwischen ihren beiden Vorgängern
function buildBracket(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, `⚽️ ${LEAGUE.title}`, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = [data.bracket.current, data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);
    widget.addSpacer(6);

    let size = largeWidgetSize();
    let rounds = data.bracket.rounds;
    let gap = 4;
    let colW = Math.floor((size.width - 28 - gap * (rounds.length - 1)) / rounds.length);
    let bodyH = size.height - 16 - 28 - 14 - 14;

    let body = widget.addStack();
    rounds.forEach((round, i) => {
        if (i > 0) body.addSpacer(gap);
        let col = body.addStack();
        col.layoutVertically();
        col.size = new Size(colW, 0);
        let title = col.addStack();
        title.size = new Size(colW, 12);
        let t = addLabel(title, round.short.toUpperCase(), Font.semiboldSystemFont(8.5), WHITE,
            round.name === data.bracket.current ? 0.9 : 0.5);
        t.centerAlignText();
        t.minimumScaleFactor = 1;
        col.addSpacer(2);
        let slotH = bodyH / round.slots;
        for (let k = 0; k < round.slots; k++) {
            let slot = col.addStack();
            slot.layoutVertically();
            slot.size = new Size(colW, slotH);
            slot.addSpacer();
            addTie(slot, round.ties[k], images, colW);
            slot.addSpacer();
        }
    });
    widget.addSpacer();
}

// Ein Duell: zwei Zeilen mit Logo, Kürzel und Toren (Hin- und Rückspiel zusammen)
function addTie(stack, tie, images, width) {
    let box = stack.addStack();
    box.layoutVertically();
    box.size = new Size(width, 0);
    box.setPadding(2, 3, 2, 3);
    box.cornerRadius = 4;
    box.backgroundColor = new Color("#FFFFFF", tie ? 0.08 : 0.04);
    let teams = tie ? tie.teams : [null, null];
    teams.slice(0, 2).forEach((team, i) => {
        if (i > 0) box.addSpacer(1);
        let row = box.addStack();
        row.centerAlignContent();
        if (!team) {
            addLabel(row, "–", Font.mediumSystemFont(9), WHITE, 0.3);
            row.addSpacer();
            return;
        }
        let fav = FAVORITES.has(team.id);
        let out = tie.winner && tie.winner !== team.id;
        addLogo(row, images, team.logo, 10);
        row.addSpacer(3);
        let name = addLabel(row, team.abbr, tie.winner === team.id ? Font.boldSystemFont(9) : Font.semiboldSystemFont(9),
            fav ? ACCENT : WHITE, out ? 0.45 : 1);
        name.minimumScaleFactor = 1;
        row.addSpacer();
        let goals = tie.state === "pre" ? "" : String(team.goals);
        addLabel(row, goals, Font.semiboldMonospacedSystemFont(9),
            tie.state === "in" ? LIVE_RED : WHITE, out ? 0.45 : 0.9).minimumScaleFactor = 1;
    });
}

// Legende der Zonen (in Tabellenreihenfolge)
function addLegend(widget, rows) {
    let seen = [];
    rows.forEach(r => { if (r.zone && !seen.find(z => z.label === r.zone.label)) seen.push(r.zone); });
    if (!seen.length) return;
    let line = widget.addStack();
    line.centerAlignContent();
    seen.forEach((z, i) => {
        if (i > 0) line.addSpacer(8);
        addLabel(line, "●", Font.boldSystemFont(8), new Color(z.color));
        line.addSpacer(2);
        addLabel(line, z.label, Font.mediumSystemFont(8), WHITE, 0.65);
    });
}

function buildTable(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, `⚽️ ${LEAGUE.title}`, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = [data.matchday ? `${data.matchday}. Spieltag` : "", data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);
    widget.addSpacer(6);

    let rows = data.rows || [];
    if (rows.length <= 20) {
        // Liga (18 Teams): eine Spalte mit allen Angaben
        addTableHeader(widget, true);
        widget.addSpacer(2);
        rows.forEach((r, i) => {
            if (i > 0) widget.addSpacer(1.5);
            addTableRow(widget, r, images, true);
        });
    } else {
        // Ligaphase (36 Teams): zwei Spalten à 18
        let half = Math.ceil(rows.length / 2);
        let body = widget.addStack();
        [rows.slice(0, half), rows.slice(half)].forEach((list, c) => {
            if (c > 0) body.addSpacer(10);
            let col = body.addStack();
            col.layoutVertically();
            addTableHeader(col, false);
            col.addSpacer(2);
            list.forEach((r, i) => {
                if (i > 0) col.addSpacer(1.5);
                addTableRow(col, r, images, false);
            });
        });
    }
    widget.addSpacer();
    addLegend(widget, rows);
    widget.addSpacer(2);
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

// Kopfzeile aller Bayern-Widgets (Bundesliga, CL, Pokal): Logo, Name, Form – rechts der Wettbewerb
function addTeamHeader(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLogo(header, images, data.logo, 22);
    header.addSpacer(6);
    addLabel(header, data.name, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer(10);
    addForm(header, data, images);
    header.addSpacer();
    // Champions League als „UCL“, damit es neben der Form passt
    let competition = HEADER_NAME[LEAGUE_KEY] || LEAGUE.title;
    addLabel(header, `${competition}${data.stale ? " · offline" : ""}`, Font.semiboldSystemFont(11), WHITE, 0.6);
}

function buildPokal(widget, data, images) {
    addTeamHeader(widget, data, images);
    widget.addSpacer(6);

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
    addTeamHeader(widget, data, images);
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
    addLabel(header, SHORT[LEAGUE_KEY] || "BL", Font.semiboldSystemFont(15), WHITE);
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
    if (data && data.schedule) {
        // Tabelle: während der Spiele und bis eine Stunde nach Abpfiff alle 5 Minuten, vor dem Anstoß
        // zum Anstoß, sonst halbstündlich
        let starts = data.schedule.map(g => new Date(g.date).getTime());
        let busy = data.schedule.some((g, i) => g.state === "in"
            || (g.state === "post" && now - starts[i] < 3 * 60 * minute));
        if (busy) return new Date(now + 5 * minute);
        let soon = Math.min(...starts.filter(t => t > now), now + 30 * minute);
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

// Größe: auf dem Homescreen die gewählte; in der App die Standardgröße (Ergebnisse groß, sonst mittel)
const FAMILY = config.widgetFamily || (VIEW === "ergebnisse" || VIEW === "tabelle" ? "large" : "medium");

async function createWidget() {
    let large = FAMILY === "large" || FAMILY === "extraLarge";
    let columns = large ? 2 : 3;
    let perColumn = large ? 7 : 3;
    COMPACT = !large;

    let data = await loadWithCache(columns * perColumn);
    let widget = new ListWidget();
    // Antippen startet das Skript in Scriptable (frische Daten) statt eine Website zu öffnen
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = nextRefresh(data);
    background(widget);
    widget.setPadding(VIEW === "ergebnisse" ? (COMPACT ? 12 : 16) : 12, 16, 4, 16);
    if (VIEW === "tabelle") widget.setPadding(12, 14, 4, 14);

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
    if (VIEW === "tabelle" && data.bracket) {
        data.bracket.rounds.forEach(r => r.ties.forEach(t => t.teams.forEach(x => urls.push(x.logo))));
    } else if (VIEW === "tabelle") {
        (data.rows || []).forEach(r => urls.push(r.logo));
    }
    let images = await loadLogos(urls);

    if (VIEW === "tabelle" && data.bracket) {
        buildBracket(widget, data, images);
    } else if (VIEW === "tabelle") {
        buildTable(widget, data, images);
    } else if (VIEW === "ergebnisse" && !COMPACT && data.sections && data.sections.length) {
        buildMatchdays(widget, data, images);
    } else if (VIEW === "ergebnisse") {
        buildResults(widget, data, columns, perColumn, images);
    } else if (VIEW === "pokal") {
        buildPokal(widget, data, images);
    } else if (FAMILY === "small") {
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
    } else if (FAMILY === "large") {
        await widget.presentLarge();
    } else {
        await widget.presentMedium();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
