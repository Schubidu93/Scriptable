// NFL – Ergebnisse der aktuellen Woche (inkl. laufender Spiele)
// Quelle: ESPN (öffentliche Schnittstelle). Im Stil der iOS-Widgets.
// Ganze Woche, ein Spiel pro Zeile wie bei den Fußball-Ergebnissen.
// Mittleres Widget (Standard): kompakt in zwei Spalten. Großes Widget: größer, mit Tageszeilen.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/";
const FAVORITE = String(
    (typeof TEAM !== "undefined" && TEAM) || args.widgetParameter || "cle"
).trim().toUpperCase();

// Größe: auf dem Homescreen die gewählte, in der App mittel
const FAMILY = config.widgetFamily || "medium";
const LARGE = FAMILY === "large" || FAMILY === "extraLarge";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "nfl-scores-woche.json");
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

function score(competitor) {
    let s = competitor && competitor.score;
    if (s == null) return "";
    if (typeof s === "object") return s.displayValue != null ? String(s.displayValue) : String(s.value);
    return String(s);
}

function logoUrl(team) {
    if (team.logo) return team.logo;
    if (team.logos && team.logos.length) return team.logos[0].href;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;
}

function parseGames(json) {
    return (json.events || []).map(event => {
        let comp = event.competitions[0];
        let status = comp.status || event.status;
        let state = status.type.state; // "pre", "in", "post"
        let side = homeAway => {
            let c = comp.competitors.find(x => x.homeAway === homeAway);
            return { abbr: c.team.abbreviation, logo: logoUrl(c.team), score: score(c), winner: !!c.winner };
        };
        return {
            id: event.id,
            date: comp.date || event.date,
            state,
            detail: status.type.shortDetail || "",
            away: side("away"),
            home: side("home"),
        };
    });
}

// Ganze Woche (alle Spiele, nach Anstoß sortiert). Hat die neue Woche noch nicht begonnen und
// ist das erste Spiel mehr als einen Tag entfernt, die abgeschlossene Vorwoche.
async function loadWeek() {
    let json = await loadJSON("scoreboard");
    let week = json.week && json.week.number;
    let seasonType = json.season && json.season.type;
    let year = json.season && json.season.year;
    let games = parseGames(json);
    let label = week ? `Woche ${week}` : "";
    let first = Math.min(...games.map(g => new Date(g.date).getTime()));
    if (week > 1 && games.length && games.every(g => g.state === "pre") && first - Date.now() > 86400000) {
        try {
            let prev = parseGames(await loadJSON(`scoreboard?seasontype=${seasonType}&week=${week - 1}&dates=${year}`));
            if (prev.length) {
                games = prev;
                label = `Woche ${week - 1}`;
            }
        } catch (e) {
            console.log(`Vorwoche nicht geladen: ${e}`);
        }
    }
    games.sort((a, b) => new Date(a.date) - new Date(b.date));
    return { label, games };
}

async function loadWithCache() {
    try {
        let data = await loadWeek();
        if (data.games.length) {
            data.updated = Date.now();
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
        DIAG.push("Keine beendeten Spiele gefunden");
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
    await Promise.all([...new Set(urls)].map(async url => {
        try {
            images[url] = await new Request(smallLogo(url)).loadImage();
        } catch (e) {
            console.log(`Logo nicht geladen: ${url}`);
        }
    }));
    return images;
}

const WHITE = Color.white();
const ACCENT = new Color("#FF3C00");
const LIVE = new Color("#FF453A");

function addLabel(stack, text, font, color, opacity = 1) {
    let t = stack.addText(text);
    t.font = font;
    t.textColor = color;
    t.textOpacity = opacity;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.7;
    return t;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#1F3A6B"), new Color("#0B1A33")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// Eine Zeile je Spiel – Logo Gast · Ergebnis bzw. Anstoß · Heim Logo (kompakt: kleiner, mit Wochentag)
function addGameRow(stack, game, images, compact = false) {
    let fontSize = compact ? 10.5 : 13;
    let logoSize = compact ? 11 : 15;
    let row = stack.addStack();
    row.centerAlignContent();
    let played = game.state !== "pre";
    let tie = game.state === "post" && !game.home.winner && !game.away.winner;
    let team = (side, alignRight) => {
        let box = row.addStack();
        box.size = new Size(compact ? 35 : 36, 0);
        if (alignRight) box.addSpacer();
        let loser = game.state === "post" && !side.winner && !tie;
        let font = !played || tie ? Font.semiboldSystemFont(fontSize) : side.winner ? Font.boldSystemFont(fontSize) : Font.mediumSystemFont(fontSize);
        addLabel(box, side.abbr, font, side.abbr === FAVORITE ? ACCENT : WHITE, loser ? 0.55 : 1).minimumScaleFactor = 1;
        if (!alignRight) box.addSpacer();
    };
    let logo = side => {
        if (images[side.logo]) {
            let img = row.addImage(images[side.logo]);
            img.imageSize = new Size(logoSize, logoSize);
        } else {
            row.addSpacer(logoSize);
        }
    };

    logo(game.away);
    row.addSpacer(3);
    team(game.away, false);
    // Feste Breite, Inhalt zentriert – ohne Abstandhalter, die selbst Platz kosten
    let mid = row.addStack();
    mid.size = new Size(44, 0);
    mid.centerAlignContent();
    let text;
    if (game.state === "pre") {
        let df = new DateFormatter();
        df.locale = "de_DE";
        df.dateFormat = compact ? "EE HH:mm" : "HH:mm";
        text = addLabel(mid, df.string(new Date(game.date)).replace(".", ""), Font.semiboldSystemFont(compact ? 8.5 : 10), WHITE, 0.7);
    } else {
        text = addLabel(mid, `${game.away.score}–${game.home.score}`, Font.boldRoundedSystemFont(fontSize),
            game.state === "in" ? LIVE : WHITE);
    }
    text.centerAlignText();
    text.minimumScaleFactor = 1;
    team(game.home, true);
    row.addSpacer(3);
    logo(game.home);
}

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

// Die Woche auf zwei Spalten (erste und zweite Hälfte nach Anstoß), Tag als Zwischenzeile
function buildWeek(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, "🏈 NFL", Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = [data.label, data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);
    widget.addSpacer(10);

    let games = data.games.slice(0, 18);
    let half = Math.ceil(games.length / 2);
    let columns = [games.slice(0, half), games.slice(half)];
    // Zeilenabstand aus der freien Höhe (Budget ~290): Tageszeile 15, Spielzeile 17
    let layout = columns.map(list => ({
        fixed: new Set(list.map(g => dayKey(g.date))).size * 15 + list.length * 17,
        rows: list.length,
    }));
    let gap = Math.max(4, Math.min(22, Math.min(...layout.map(l => (290 - l.fixed) / Math.max(1, l.rows - 1)))));

    let row = widget.addStack();
    columns.forEach((list, c) => {
        if (c > 0) row.addSpacer();
        let col = row.addStack();
        col.layoutVertically();
        let lastDay = null;
        list.forEach((game, i) => {
            if (dayKey(game.date) !== lastDay) {
                if (i > 0) col.addSpacer(gap);
                addLabel(col, dayTitle(game.date), Font.semiboldSystemFont(9), ACCENT, 0.9);
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

// Mittleres Widget: die ganze Woche kompakt in zwei Spalten, ohne Tageszeilen
function buildWeekCompact(widget, data, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, "🏈 NFL", Font.semiboldSystemFont(13), WHITE);
    header.addSpacer();
    let info = [data.label, data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(header, info, Font.semiboldSystemFont(10), WHITE, 0.6);
    widget.addSpacer(4);

    let games = data.games.slice(0, 16);
    let half = Math.ceil(games.length / 2);
    // Zeilen à ~12,5 pt in ~114 pt Höhe; bei weniger Spielen mehr Abstand
    let gap = Math.max(1, Math.min(7, (114 - half * 12.5) / Math.max(1, half - 1)));
    let row = widget.addStack();
    [games.slice(0, half), games.slice(half)].forEach((list, c) => {
        if (c > 0) row.addSpacer();
        let col = row.addStack();
        col.layoutVertically();
        list.forEach((game, i) => {
            if (i > 0) col.addSpacer(gap);
            addGameRow(col, game, images, true);
        });
        col.addSpacer();
    });
    widget.addSpacer();
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

// Bei laufenden Spielen alle 5 Minuten, sonst zum nächsten Anstoß bzw. nach 30 Minuten
function nextRefresh(data) {
    let now = Date.now(), minute = 60000;
    if (!data || !data.games) return new Date(now + 30 * minute);
    if (data.games.some(g => g.state === "in") && !data.stale) return new Date(now + 5 * minute);
    let kickoffs = data.games.filter(g => g.state === "pre").map(g => new Date(g.date).getTime()).filter(t => t > now);
    return new Date(Math.max(Math.min(...kickoffs, now + 30 * minute), now + 5 * minute));
}

async function createWidget() {
    let large = LARGE;
    let data = await loadWithCache();
    let widget = new ListWidget();
    // Antippen startet das Skript in Scriptable (frische Daten) statt eine Website zu öffnen
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = nextRefresh(data);
    background(widget);
    widget.setPadding(large ? 12 : 10, 16, 4, 16);

    if (!data) {
        buildError(widget);
        return widget;
    }
    let shown = data.games.slice(0, large ? 18 : 16);
    let images = await loadLogos(shown.flatMap(g => [g.away.logo, g.home.logo]));
    if (large) buildWeek(widget, data, images);
    else buildWeekCompact(widget, data, images);
    addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else if (LARGE) {
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
