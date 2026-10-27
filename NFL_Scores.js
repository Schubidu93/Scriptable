// NFL – die letzten Ergebnisse der aktuellen Woche (inkl. laufender Spiele)
// Quelle: ESPN (öffentliche Schnittstelle). Mittleres oder großes Widget, im Stil der iOS-Widgets.

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/";
const FAVORITE = String(
    (typeof TEAM !== "undefined" && TEAM) || args.widgetParameter || "cle"
).trim().toUpperCase();

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "nfl-scores.json");
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

// Beendete und laufende Spiele, neueste zuerst; reicht die Woche nicht, die Vorwoche dazu
async function loadData(count) {
    let json = await loadJSON("scoreboard");
    let week = json.week && json.week.number;
    let seasonType = json.season && json.season.type;
    let year = json.season && json.season.year;

    let games = parseGames(json).filter(g => g.state !== "pre");
    let label = week ? `Woche ${week}` : "";

    if (games.length < count && week > 1) {
        try {
            let prev = await loadJSON(`scoreboard?seasontype=${seasonType}&week=${week - 1}&dates=${year}`);
            let prevGames = parseGames(prev).filter(g => g.state !== "pre");
            if (prevGames.length) label = games.length ? `Woche ${week - 1}–${week}` : `Woche ${week - 1}`;
            games = games.concat(prevGames);
        } catch (e) {
            console.log(`Vorwoche nicht geladen: ${e}`);
        }
    }

    // Laufende Spiele zuerst, dann neueste Ergebnisse
    games.sort((a, b) => (b.state === "in") - (a.state === "in") || new Date(b.date) - new Date(a.date));
    return { label, games };
}

async function loadWithCache(count) {
    try {
        let data = await loadData(count);
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

// Mittleres Widget mit 9 Spielen: etwas kleinere Zeilen, damit alles samt Kopfzeile passt
let COMPACT = false;

function addTeamLine(stack, team, game, images) {
    let size = COMPACT ? 14 : 16;
    let fontSize = COMPACT ? 12 : 13;
    let row = stack.addStack();
    row.centerAlignContent();
    if (images[team.logo]) {
        let img = row.addImage(images[team.logo]);
        img.imageSize = new Size(size, size);
    } else {
        row.addSpacer(size);
    }
    row.addSpacer(5);
    let favorite = team.abbr === FAVORITE;
    let loser = game.state === "post" && !team.winner;
    let font = team.winner ? Font.boldSystemFont(fontSize) : Font.mediumSystemFont(fontSize);
    addLabel(row, team.abbr, font, favorite ? ACCENT : WHITE, loser ? 0.55 : 1);
    row.addSpacer();
    let scoreFont = team.winner ? Font.boldMonospacedSystemFont(fontSize) : Font.mediumMonospacedSystemFont(fontSize);
    addLabel(row, team.score, scoreFont, WHITE, loser ? 0.55 : 1);
}

function addGame(stack, game, images) {
    let box = stack.addStack();
    box.layoutVertically();
    box.url = `https://www.espn.com/nfl/game/_/gameId/${game.id}`;
    addTeamLine(box, game.away, game, images);
    box.addSpacer(1);
    addTeamLine(box, game.home, game, images);
    if (game.state === "in") {
        box.addSpacer(1);
        addLabel(box, `● ${game.detail}`, Font.semiboldSystemFont(9), LIVE);
    }
}

function build(widget, data, columns, perColumn, images) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, "🏈 NFL", Font.semiboldSystemFont(15), WHITE);
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
            if (i > 0) col.addSpacer(COMPACT ? 4 : 7);
            addGame(col, game, images);
        });
        col.addSpacer();
    }
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

async function createWidget() {
    let large = config.widgetFamily === "large" || config.widgetFamily === "extraLarge";
    let columns = large ? 2 : 3;
    COMPACT = !large;
    let perColumn = large ? 7 : 3;

    let data = await loadWithCache(columns * perColumn);
    let widget = new ListWidget();
    widget.url = "https://www.espn.com/nfl/scoreboard";
    widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
    background(widget);
    widget.setPadding(COMPACT ? 14 : 18, 16, 4, 16);

    if (!data) {
        buildError(widget);
        return widget;
    }
    let shown = data.games.slice(0, columns * perColumn);
    let images = await loadLogos(shown.flatMap(g => [g.away.logo, g.home.logo]));
    build(widget, data, columns, perColumn, images);
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
