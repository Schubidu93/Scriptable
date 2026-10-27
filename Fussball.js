// Fußball – Lieblingsteam (Standard: FC Bayern) in Bundesliga oder Champions League:
// letztes Spiel, Form, nächstes Spiel (am Spieltag live) und Tabellen-Ausschnitt.
// Quelle: ESPN (öffentliche Schnittstelle). Mittleres Widget, Aufbau wie das Browns-Widget.
//
// Wettbewerb: "bundesliga" (Standard) oder "cl" – im Loader per
// Function("LIGA", code)("cl") oder als Widget-Parameter, z. B. "cl".

const ESPN = "https://site.api.espn.com/apis/";
const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const LEAGUE_KEY = String((typeof LIGA !== "undefined" && LIGA) || params.find(p => p === "cl" || p === "bundesliga") || "bundesliga").toLowerCase();
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
};
const LEAGUE = LEAGUES[LEAGUE_KEY] || LEAGUES.bundesliga;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `fussball-${LEAGUE_KEY}-${TEAM_ID}.json`);
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
        home: us.homeAway === "home",
        opponent: them.team.abbreviation || them.team.shortDisplayName,
        opponentName: them.team.shortDisplayName || them.team.displayName,
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

// Alle Spiele des Wettbewerbs in einem Zeitraum, davon die des eigenen Teams
async function loadGames() {
    let now = new Date();
    let from = new Date(now.getTime() - 240 * 86400000);
    let to = new Date(now.getTime() + 120 * 86400000);
    let json = await loadJSON(`site/v2/sports/soccer/${LEAGUE.slug}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=1000`);
    return (json.events || []).filter(involvesTeam).sort((a, b) => new Date(a.date) - new Date(b.date));
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

// Tabellen-Ausschnitt mit 6 Zeilen:
//   Platz 1–4:  Plätze 1–6
//   sonst:      Platz 1, …, Platz davor, eigenes Team, Platz danach, …
function standingsWindow(rows, pos) {
    if (pos < 0) return rows.slice(0, 6);
    if (pos <= 3) return rows.slice(0, 6);
    // Am Tabellenende statt der hinteren Lücke ein Platz mehr
    if (pos + 1 >= rows.length - 1) return [rows[0], { gap: true }].concat(rows.slice(-4));
    return [rows[0], { gap: true }].concat(rows.slice(pos - 1, pos + 2), [{ gap: true }]);
}

function parseStandings(json) {
    let groups = collectGroups(json).filter(g => g.standings.entries.some(e => String(e.team.id) === TEAM_ID));
    let group = groups.sort((a, b) => a.standings.entries.length - b.standings.entries.length)[0] || collectGroups(json)[0];
    if (!group) return null;
    let rows = group.standings.entries.map((e, i) => ({
        id: String(e.team.id),
        abbr: e.team.abbreviation || e.team.shortDisplayName,
        logo: logoUrl(e.team),
        rank: stat(e, "rank") || i + 1,
        points: stat(e, "points"),
        played: stat(e, "gamesPlayed"),
    })).sort((a, b) => a.rank - b.rank);
    let pos = rows.findIndex(r => r.id === TEAM_ID);
    return { rows: standingsWindow(rows, pos), own: pos >= 0 ? rows[pos] : null };
}

async function loadData() {
    let games = await loadGames();
    let finished = games.filter(e => stateOf(e) === "post");
    let liveEvent = games.find(e => stateOf(e) === "in");
    let upcoming = games.filter(e => stateOf(e) === "pre");

    let last = finished.length ? gameInfo(finished[finished.length - 1]) : null;
    let form = finished.slice(-5).map(gameInfo);
    let live = liveEvent ? { ...gameInfo(liveEvent), detail: liveDetail(statusOf(liveEvent)) } : null;
    let next = upcoming.length ? gameInfo(upcoming[0]) : null;

    let team = null;
    for (let e of games) {
        let c = e.competitions[0].competitors.find(x => String(x.team.id) === TEAM_ID);
        if (c) { team = c.team; break; }
    }

    let standings = null;
    try {
        standings = parseStandings(await loadJSON(`v2/sports/soccer/${LEAGUE.slug}/standings`));
    } catch (e) {
        console.log(`Tabelle nicht geladen: ${e}`);
    }

    return {
        name: TEAM_ID === "132" ? "FC Bayern" : team ? (team.shortDisplayName || team.displayName) : "",
        logo: team ? logoUrl(team) : null,
        record: standings && standings.own ? `${standings.own.points} Pkt` : "",
        last,
        form,
        live,
        next,
        standings,
    };
}

async function loadWithCache() {
    try {
        let data = await loadData();
        if (data.last || data.next || data.live) {
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

async function loadLogos(urls) {
    let images = {};
    await Promise.all([...new Set(urls.filter(Boolean))].map(async url => {
        try {
            images[url] = await new Request(url).loadImage();
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

function addRecord(stack, record) {
    if (!record) return;
    let pill = stack.addStack();
    pill.backgroundColor = new Color("#ffffff", 0.18);
    pill.cornerRadius = 9;
    pill.setPadding(1, 9, 1, 9);
    addLabel(pill, record, Font.boldRoundedSystemFont(17), WHITE);
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

// 6 Zeilen: kompakt, damit sie ins mittlere Widget passen; Lücken als „···“
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
        addLabel(row, `${r.points}`, Font.semiboldMonospacedSystemFont(10), WHITE, 0.85);
    });
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
    addRecord(header, data.record);

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
    right.size = new Size(110, 0);
    addStandings(right, data, images);
    right.addSpacer();
}

function buildSmall(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLogo(header, images, data.logo, 20);
    header.addSpacer(5);
    addLabel(header, LEAGUE_KEY === "cl" ? "CL" : "BL", Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    addRecord(header, data.record);
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
    if (data && data.live && !data.stale) return new Date(now + 5 * minute);
    if (data && data.next) {
        let kickoff = new Date(data.next.date).getTime();
        if (kickoff > now && kickoff - now < 60 * minute) return new Date(Math.max(kickoff, now + 5 * minute));
        if (kickoff <= now && now - kickoff < 3 * 60 * minute) return new Date(now + 5 * minute);
    }
    return new Date(now + 60 * minute);
}

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    widget.url = LEAGUE.url;
    widget.refreshAfterDate = nextRefresh(data);
    background(widget);
    widget.setPadding(12, 16, 4, 16);

    if (!data) {
        buildError(widget);
        return widget;
    }

    let urls = [data.logo];
    if (data.last) urls.push(data.last.opponentLogo);
    (data.form || []).forEach(g => urls.push(g.opponentLogo));
    if (data.next) urls.push(data.next.opponentLogo);
    if (data.live) urls.push(data.live.opponentLogo);
    if (data.standings) data.standings.rows.forEach(r => urls.push(r.logo));
    let images = await loadLogos(urls);

    if (config.widgetFamily === "small") {
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
