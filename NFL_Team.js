// NFL – Lieblingsteam: letztes Ergebnis, nächstes Spiel, Division-Tabelle
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
        if (us.winner) result = "S";
        else if (them.winner) result = "N";
        else result = Number(ourScore) > Number(theirScore) ? "S" : Number(ourScore) < Number(theirScore) ? "N" : "U";
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

    let finished = events.filter(isCompleted);
    let last = finished.length ? gameInfo(finished[finished.length - 1], team.id) : null;

    let upcoming = (team.nextEvent || []).filter(e => !isCompleted(e));
    if (!upcoming.length) upcoming = events.filter(e => !isCompleted(e));
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
        abbr: team.abbreviation,
        logo: logoUrl(team),
        record: record ? record.summary : "",
        summary: team.standingSummary || "",
        last,
        next,
        standings,
    };
}

async function loadWithCache() {
    try {
        let data = await loadData();
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
        DIAG.push(`Fehler: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        return data;
    }
    return null;
}

// Logos parallel laden, Fehler ignorieren
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
const RESULT_COLORS = { S: new Color("#34C759"), N: new Color("#FF453A"), U: new Color("#8E8E93") };
const RESULT_LABELS = { S: "Sieg", N: "Niederlage", U: "Unentschieden" };

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

function addSectionTitle(stack, text) {
    addLabel(stack, text.toUpperCase(), Font.semiboldSystemFont(10), WHITE, 0.6);
}

function addLastGame(stack, last, images) {
    addSectionTitle(stack, "Letztes Spiel");
    stack.addSpacer(3);
    if (!last) {
        addLabel(stack, "–", Font.mediumSystemFont(13), WHITE, 0.7);
        return;
    }
    let row = stack.addStack();
    row.centerAlignContent();
    let badge = row.addStack();
    badge.backgroundColor = RESULT_COLORS[last.result] || RESULT_COLORS.U;
    badge.cornerRadius = 4;
    badge.setPadding(1, 5, 1, 5);
    addLabel(badge, last.result || "–", Font.boldSystemFont(11), WHITE);
    row.addSpacer(6);
    addLabel(row, `${last.ourScore}:${last.theirScore}`, Font.semiboldMonospacedSystemFont(17), WHITE);
    row.addSpacer(6);
    addLabel(row, last.home ? "vs" : "@", Font.mediumSystemFont(11), WHITE, 0.6);
    row.addSpacer(3);
    addLogo(row, images, last.opponentLogo, 18);
    row.addSpacer(2);
    addLabel(row, last.opponent, Font.semiboldSystemFont(12), WHITE);
    addLabel(stack, `${RESULT_LABELS[last.result] || ""} · ${formatDay(last.date)}`, Font.mediumSystemFont(10), WHITE, 0.6);
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
    addLabel(header, data.name, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = [data.record, data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(12), WHITE, 0.7);

    widget.addSpacer(10);

    let body = widget.addStack();
    let left = body.addStack();
    left.layoutVertically();
    addLastGame(left, data.last, images);
    left.addSpacer(8);
    addNextGame(left, data.next, images);
    left.addSpacer();

    body.addSpacer(14);

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
    addLabel(header, data.record, Font.semiboldSystemFont(12), WHITE, 0.7);
    widget.addSpacer(8);
    addLastGame(widget, data.last, images);
    widget.addSpacer();
    addNextGame(widget, data.next, images);
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

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    widget.url = `https://www.espn.com/nfl/team/_/name/${teamKey}`;
    widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);
    background(widget);
    widget.setPadding(14, 16, 14, 16);

    if (!data) {
        buildError(widget);
        return widget;
    }

    let urls = [data.logo];
    if (data.last) urls.push(data.last.opponentLogo);
    if (data.next) urls.push(data.next.opponentLogo);
    if (data.standings) data.standings.rows.forEach(r => urls.push(r.logo));
    let images = await loadLogos(urls);

    if (config.widgetFamily === "small") {
        buildSmall(widget, data, images);
    } else {
        buildMedium(widget, data, images);
    }
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
