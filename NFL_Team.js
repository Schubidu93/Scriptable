// NFL – Lieblingsteam: letztes Ergebnis, nächstes Spiel (am Spieltag live), Division-Tabelle
// Quelle: ESPN (öffentliche Schnittstelle). Mittleres Widget, im Stil der iOS-Widgets.
//
// Team wählen: Standard "cle" (Cleveland Browns) – im Loader per
// Function("TEAM", code)("pit") oder als Widget-Parameter, z. B. "kc".

const ESPN = "https://site.api.espn.com/apis/";
const teamKey = String(
    (typeof TEAM !== "undefined" && TEAM) || args.widgetParameter || "cle"
).trim().toLowerCase();

// Teamfarben für den Hintergrund (Browns: Braun → Orange)
const COLORS = {
    cle: ["#4A2A0C", "#311D00", "#FF3C00"],
};
const DEFAULT_COLORS = ["#2B3A55", "#14213D", "#FCA311"];

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `nfl-team-${teamKey}.json`);
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
    let req = new Request(ESPN + path);
    try {
        return await req.loadJSON();
    } catch (e) {
        DIAG.push(`${path.split("?")[0]}: ${e}`);
        throw e;
    }
}

function score(competitor) {
    let s = competitor && competitor.score;
    if (s == null) return "";
    if (typeof s === "object") return s.displayValue != null ? String(s.displayValue) : String(s.value);
    return String(s);
}

function logoUrl(team) {
    if (!team) return null;
    if (team.logo) return team.logo;
    if (team.logos && team.logos.length) return team.logos[0].href;
    return team.abbreviation
        ? `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`
        : null;
}

function statusOf(event) {
    let comp = event.competitions && event.competitions[0];
    return (comp && comp.status) || event.status || { type: {} };
}

// "3. Viertel · 5:32", "Halbzeit", "Verlängerung · 2:10"
function liveDetail(status) {
    let detail = (status.type && (status.type.shortDetail || status.type.detail)) || "";
    if (/half/i.test(detail)) return "Halbzeit";
    let period = Number(status.period) || 0;
    let quarter = period > 4 ? "Verlängerung" : period ? `${period}. Viertel` : "";
    if (/end/i.test(detail)) return quarter ? `Ende ${quarter}` : detail;
    let clock = status.displayClock && status.displayClock !== "0:00" ? status.displayClock : "";
    return [quarter, clock].filter(Boolean).join(" · ") || detail;
}

function isCompleted(event) {
    let comp = event.competitions && event.competitions[0];
    let status = (comp && comp.status) || event.status;
    return !!(status && status.type && status.type.completed);
}

// Aus Sicht des Lieblingsteams: Gegner, Heim/Auswärts, Ergebnis
function gameInfo(event, teamId) {
    let comp = event.competitions[0];
    let us = comp.competitors.find(c => String(c.team.id) === String(teamId)) || comp.competitors[0];
    let them = comp.competitors.find(c => c !== us);
    let ourScore = score(us), theirScore = score(them);
    let result = "";
    if (isCompleted(event)) {
        if (us.winner) result = "W";
        else if (them.winner) result = "L";
        else result = Number(ourScore) > Number(theirScore) ? "W" : Number(ourScore) < Number(theirScore) ? "L" : "T";
    }
    return {
        date: comp.date || event.date,
        home: us.homeAway === "home",
        opponent: them.team.abbreviation,
        opponentName: them.team.shortDisplayName || them.team.displayName,
        opponentLogo: logoUrl(them.team),
        ourScore,
        theirScore,
        result,
        week: event.week && (event.week.text || (event.week.number ? `Woche ${event.week.number}` : "")),
    };
}

// Alle Gruppen mit Tabelleneinträgen einsammeln (Conference → Division)
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

function parseStandings(json, teamId) {
    let groups = collectGroups(json)
        .filter(g => g.standings.entries.some(e => String(e.team.id) === String(teamId)))
        .sort((a, b) => a.standings.entries.length - b.standings.entries.length);
    let group = groups[0];
    if (!group) return null;

    let rows = group.standings.entries
        .map((e, i) => ({
            id: String(e.team.id),
            abbr: e.team.abbreviation,
            logo: logoUrl(e.team),
            wins: stat(e, "wins"),
            losses: stat(e, "losses"),
            ties: stat(e, "ties"),
            pct: stat(e, "winPercent"),
            order: i,
        }))
        .sort((a, b) => b.pct - a.pct || a.order - b.order);

    // Bei großen Gruppen (Conference) nur den Ausschnitt rund ums eigene Team zeigen
    if (rows.length > 4) {
        let pos = rows.findIndex(r => r.id === String(teamId));
        let start = Math.max(0, Math.min(pos - 1, rows.length - 4));
        rows = rows.slice(start, start + 4).map((r, i) => ({ ...r, rank: start + i + 1 }));
    } else {
        rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return { name: group.abbreviation || group.name, rows };
}

async function loadData() {
    let teamJson = await loadJSON(`site/v2/sports/football/nfl/teams/${teamKey}`);
    let team = teamJson.team;
    let schedule = await loadJSON(`site/v2/sports/football/nfl/teams/${teamKey}/schedule`).catch(() => ({ events: [] }));
    let events = (schedule.events || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));

    let upcoming = (team.nextEvent || []).filter(e => !isCompleted(e));
    if (!upcoming.length) upcoming = events.filter(e => !isCompleted(e));

    // Spieltag: Ist der Anstoß vorbei, den aktuellen Stand vom Scoreboard holen
    let live = null;
    let kickedOff = upcoming.find(e => new Date(e.date) <= new Date());
    if (kickedOff) {
        let current = kickedOff;
        try {
            let board = await loadJSON("site/v2/sports/football/nfl/scoreboard");
            current = (board.events || []).find(e => String(e.id) === String(kickedOff.id)) || kickedOff;
        } catch (e) {
            console.log(`Scoreboard nicht geladen: ${e}`);
        }
        if (isCompleted(current)) {
            // Gerade beendet, Spielplan aber noch nicht aktualisiert
            events = events.filter(e => String(e.id) !== String(current.id)).concat([current]);
        } else if (statusOf(current).type.state === "in") {
            live = { ...gameInfo(current, team.id), detail: liveDetail(statusOf(current)) };
        }
        upcoming = upcoming.filter(e => String(e.id) !== String(current.id));
        if (!upcoming.length) {
            upcoming = events.filter(e => !isCompleted(e) && String(e.id) !== String(current.id) && new Date(e.date) > new Date());
        }
    }

    let finished = events.filter(isCompleted);
    let last = finished.length ? gameInfo(finished[finished.length - 1], team.id) : null;
    let form = finished.slice(-5).map(e => gameInfo(e, team.id));
    let next = upcoming.length ? gameInfo(upcoming[0], team.id) : null;

    let standings = null;
    try {
        standings = parseStandings(await loadJSON("v2/sports/football/nfl/standings?level=3"), team.id);
    } catch (e) {
        console.log(`Tabelle nicht geladen: ${e}`);
    }

    let record = team.record && team.record.items && team.record.items[0];
    return {
        id: String(team.id),
        name: team.displayName,
        shortName: team.name || team.shortDisplayName,
        abbr: team.abbreviation,
        logo: logoUrl(team),
        record: record ? record.summary : "",
        summary: team.standingSummary || "",
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
        data.updated = Date.now();
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
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

// Logos parallel laden, Fehler ignorieren
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
const LIVE_RED = new Color("#FF6B5E");
const RESULT_COLORS = { W: new Color("#34C759"), L: new Color("#FF453A"), T: new Color("#8E8E93") };

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
    let date = new Date(dateString);
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "EE dd.MM. · HH:mm";
    return df.string(date);
}

function formatDay(dateString) {
    let df = new DateFormatter();
    df.locale = "de_DE";
    df.dateFormat = "dd.MM.";
    return df.string(new Date(dateString));
}

function background(widget) {
    let colors = COLORS[teamKey] || DEFAULT_COLORS;
    let gradient = new LinearGradient();
    gradient.colors = [new Color(colors[0]), new Color(colors[1])];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function accent() {
    return new Color((COLORS[teamKey] || DEFAULT_COLORS)[2]);
}

function addRecord(stack, record) {
    if (!record) return;
    let pill = stack.addStack();
    pill.backgroundColor = new Color("#ffffff", 0.18);
    pill.cornerRadius = 9;
    pill.setPadding(1, 9, 1, 9);
    addLabel(pill, record, Font.boldRoundedSystemFont(17), WHITE);
}

function addSectionTitle(stack, text) {
    addLabel(stack, text.toUpperCase(), Font.semiboldSystemFont(10), WHITE, 0.6);
}

function addBadge(stack, result, size) {
    let badge = stack.addStack();
    badge.size = new Size(size, size);
    badge.backgroundColor = RESULT_COLORS[result] || RESULT_COLORS.T;
    badge.cornerRadius = 4;
    badge.centerAlignContent();
    addLabel(badge, result || "–", Font.boldSystemFont(size * 0.65), WHITE);
}

// Letztes Spiel groß: Badge, Ergebnis, darunter Gegner und Datum
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
    // Im kleinen Widget stehen Gegner und Datum unter dem Ergebnis
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

// Form klein: Gegner-Logo über W/L-Badge, ältestes Spiel links, neuestes rechts
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

// Live-Spielstand: eigener Score groß, Viertel und Uhr in Rot
function addLiveGame(stack, live, images) {
    let title = stack.addStack();
    title.centerAlignContent();
    addLabel(title, "● LIVE", Font.boldSystemFont(10), LIVE_RED);
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
        addLabel(stack, "Saisonpause", Font.mediumSystemFont(13), WHITE, 0.7);
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

function addStandings(stack, data, images) {
    let standings = data.standings;
    addSectionTitle(stack, standings ? standings.name : "Tabelle");
    stack.addSpacer(3);
    if (!standings) {
        addLabel(stack, data.summary || "–", Font.mediumSystemFont(11), WHITE, 0.7);
        return;
    }
    standings.rows.forEach((r, i) => {
        if (i > 0) stack.addSpacer(3);
        let mine = r.id === data.id;
        let row = stack.addStack();
        row.centerAlignContent();
        if (mine) {
            row.backgroundColor = new Color("#ffffff", 0.15);
            row.cornerRadius = 5;
        }
        row.setPadding(1, 3, 1, 3);
        addLabel(row, `${r.rank}`, Font.mediumMonospacedSystemFont(11), WHITE, 0.6);
        row.addSpacer(4);
        addLogo(row, images, r.logo, 14);
        row.addSpacer(3);
        addLabel(row, r.abbr, mine ? Font.boldSystemFont(12) : Font.mediumSystemFont(12), mine ? accent() : WHITE);
        row.addSpacer();
        let record = r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
        addLabel(row, record, Font.mediumMonospacedSystemFont(11), WHITE, 0.85);
    });
}

function buildMedium(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLogo(header, images, data.logo, 22);
    header.addSpacer(6);
    addLabel(header, data.shortName || data.name.split(" ").pop(), Font.semiboldSystemFont(15), WHITE);
    header.addSpacer(10);
    addForm(header, data, images);
    header.addSpacer();
    if (data.stale) {
        addLabel(header, "offline", Font.semiboldSystemFont(10), WHITE, 0.6);
        header.addSpacer(6);
    }
    addRecord(header, data.record);

    widget.addSpacer(6);

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
    addLabel(header, data.abbr, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    addRecord(header, data.record);
    widget.addSpacer(6);
    addLastGame(widget, data.last, images, true);
    widget.addSpacer();
    if (data.live) addLiveGame(widget, data.live, images);
    else addNextGame(widget, data.next, images);
}

function buildError(widget) {
    addLabel(widget, "🏈 NFL", Font.semiboldSystemFont(15), WHITE);
    widget.addSpacer(6);
    addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(13), WHITE, 0.8);
    widget.addSpacer(6);
    DIAG.slice(0, 4).forEach(line => {
        let t = addLabel(widget, line, Font.regularMonospacedSystemFont(10), WHITE, 0.6);
        t.lineLimit = 2;
    });
    widget.addSpacer();
}

// Live: alle 5 Minuten. Spieltag vor dem Anstoß: zum Anstoß. Sonst stündlich.
function nextRefresh(data) {
    let minute = 60 * 1000;
    let now = Date.now();
    if (data && data.live && !data.stale) return new Date(now + 5 * minute);
    if (data && data.next) {
        let kickoff = new Date(data.next.date).getTime();
        if (kickoff > now && kickoff - now < 60 * minute) return new Date(Math.max(kickoff, now + 5 * minute));
        if (kickoff <= now && now - kickoff < 5 * 60 * minute) return new Date(now + 5 * minute);
    }
    return new Date(now + 60 * minute);
}

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    widget.url = `https://www.espn.com/nfl/team/_/name/${teamKey}`;
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
