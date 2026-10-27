// ClubElo – die besten Vereine nach Elo, mit Veränderung zum Vormonat.
// Die Daten holt alle 6 Stunden ein GitHub-Workflow (scripts/clubelo.mjs); das Widget lädt die
// fertige Datei. Fehlt sie, fragt es ClubElo direkt. Der letzte Stand wird auf dem iPhone gespeichert.
// Kleines Widget: Top 5. Mittleres Widget: Top 10 in zwei Spalten mit Flaggen und Elo-Änderung.

const DATA_URL = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/data/clubelo.json";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "clubelo.json");

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

// Direkt bei ClubElo: CSV mit Rank,Club,Country,Level,Elo,From,To
async function loadRanking(date) {
    let req = new Request(`http://api.clubelo.com/${date.toISOString().slice(0, 10)}`);
    req.timeoutInterval = 15;
    let lines = (await req.loadString()).trim().split(/\r?\n/);
    let header = lines.shift().split(",");
    let col = name => header.indexOf(name);
    let clubs = lines.map(l => l.split(",")).map(c => ({
        club: c[col("Club")], country: c[col("Country")], elo: Math.round(Number(c[col("Elo")])),
    })).filter(c => c.club && c.elo).sort((a, b) => b.elo - a.elo);
    clubs.forEach((c, i) => { c.rank = i + 1; });
    if (!clubs.length) throw new Error("ClubElo: leere Liste");
    return clubs;
}

async function loadDirect() {
    let today = new Date();
    let now = await loadRanking(today);
    let then = await loadRanking(new Date(today.getTime() - 30 * 86400000)).catch(() => []);
    let previous = {};
    then.forEach(c => { previous[c.club] = c; });
    return {
        generated: today.toISOString(),
        clubs: now.slice(0, 10).map(c => ({
            ...c,
            prevRank: previous[c.club] ? previous[c.club].rank : null,
            prevElo: previous[c.club] ? previous[c.club].elo : null,
        })),
    };
}

// Reihenfolge: Datei auf GitHub (ist sie älter als 2 Tage, zuerst ClubElo direkt versuchen),
// dann ClubElo direkt, zuletzt der Zwischenspeicher auf dem iPhone
async function loadData() {
    let fromGitHub = null;
    try {
        let data = await new Request(DATA_URL).loadJSON();
        if (data && data.clubs && data.clubs.length) fromGitHub = data;
    } catch (e) {
        console.log(`GitHub: ${e}`);
    }
    let fresh = fromGitHub && Date.now() - new Date(fromGitHub.generated).getTime() < 2 * 86400000;
    let data = fresh ? fromGitHub : null;
    if (!data) {
        try {
            data = await loadDirect();
        } catch (e) {
            console.log(`ClubElo direkt: ${e}`);
            data = fromGitHub;
        }
    }
    if (data) {
        fm.writeString(cachePath, JSON.stringify(data));
        UPDATED = new Date(data.generated).getTime();
        return data;
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        UPDATED = new Date(data.generated).getTime();
        return data;
    }
    return null;
}

// ClubElo-Länderkürzel → Flagge (England, Schottland als eigene Flaggen)
const COUNTRY_FLAGS = {
    ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", GER: "🇩🇪", ESP: "🇪🇸", ITA: "🇮🇹", FRA: "🇫🇷",
    POR: "🇵🇹", NED: "🇳🇱", BEL: "🇧🇪", AUT: "🇦🇹", SUI: "🇨🇭", TUR: "🇹🇷", GRE: "🇬🇷", DEN: "🇩🇰",
    NOR: "🇳🇴", SWE: "🇸🇪", CZE: "🇨🇿", CRO: "🇭🇷", SRB: "🇷🇸", UKR: "🇺🇦", RUS: "🇷🇺", POL: "🇵🇱",
};

const WHITE = Color.white();
const UP = new Color("#34C759");
const DOWN = new Color("#FF453A");
const SAME = new Color("#8E8E93");

function addLabel(stack, text, font, color, opacity = 1) {
    let t = stack.addText(text);
    t.font = font;
    t.textColor = color;
    t.textOpacity = opacity;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.7;
    return t;
}

function addSymbol(stack, name, size, color) {
    let sym = SFSymbol.named(name);
    sym.applyFont(Font.boldSystemFont(size));
    let img = stack.addImage(sym.image);
    img.imageSize = new Size(size, size);
    img.tintColor = color;
    return img;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#2D3E50"), new Color("#141E2A")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// Fester, schmaler Bereich mit rechtsbündigem Inhalt
function addColumn(stack, width) {
    let col = stack.addStack();
    col.size = new Size(width, 0);
    col.addSpacer();
    return col;
}

function eloTrend(c) {
    if (c.prevElo == null) return { color: SAME, symbol: "minus", text: "neu" };
    let diff = c.elo - c.prevElo;
    if (diff > 0) return { color: UP, symbol: "arrowtriangle.up.fill", text: `+${diff}` };
    if (diff < 0) return { color: DOWN, symbol: "arrowtriangle.down.fill", text: `${diff}` };
    return { color: SAME, symbol: "minus", text: "±0" };
}

// Platzierungsveränderung: "↑2" grün, "↓1" rot, sonst leer
function rankChange(c) {
    if (c.prevRank == null || c.prevRank === c.rank) return null;
    let up = c.prevRank > c.rank;
    return { text: `${up ? "↑" : "↓"}${Math.abs(c.prevRank - c.rank)}`, color: up ? UP : DOWN };
}

function addHeader(widget, data, compact) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, compact ? "ClubElo" : "⚽️ ClubElo", Font.semiboldSystemFont(compact ? 13 : 15), WHITE);
    header.addSpacer();
    let info = `ggü. ${compact ? "Vormonat" : "vor 30 Tagen"}${data && data.stale ? " · offline" : ""}`;
    addLabel(header, info, Font.semiboldSystemFont(compact ? 8 : 10), WHITE, 0.55);
}

// Kleines Widget: Rang, Platzierungsänderung, Verein, Elo und Trend-Pfeil
function addSmallRow(stack, c) {
    let row = stack.addStack();
    row.centerAlignContent();
    let rank = row.addStack();
    rank.size = new Size(12, 0);
    addLabel(rank, `${c.rank}`, Font.semiboldMonospacedSystemFont(11), WHITE, 0.6);
    let change = rankChange(c);
    let changeCol = row.addStack();
    changeCol.size = new Size(16, 0);
    if (change) addLabel(changeCol, change.text, Font.boldSystemFont(8), change.color);
    addLabel(row, c.club, Font.semiboldSystemFont(12), WHITE);
    row.addSpacer(3);
    row.addSpacer();
    addLabel(row, `${c.elo}`, Font.mediumMonospacedSystemFont(11), WHITE, 0.85);
    row.addSpacer(3);
    let trend = eloTrend(c);
    addSymbol(row, trend.symbol, 8, trend.color);
}

// Mittleres Widget: zusätzlich Flagge und Elo-Differenz als Zahl
function addMediumRow(stack, c) {
    let row = stack.addStack();
    row.centerAlignContent();
    let rank = row.addStack();
    rank.size = new Size(15, 0);
    addLabel(rank, `${c.rank}`, Font.semiboldMonospacedSystemFont(11), WHITE, 0.6);
    let change = rankChange(c);
    let changeCol = row.addStack();
    changeCol.size = new Size(18, 0);
    if (change) addLabel(changeCol, change.text, Font.boldSystemFont(9), change.color);
    let flag = COUNTRY_FLAGS[c.country];
    addLabel(row, `${flag ? flag + " " : ""}${c.club}`, Font.semiboldSystemFont(12), WHITE);
    row.addSpacer(3);
    row.addSpacer();
    addLabel(row, `${c.elo}`, Font.mediumMonospacedSystemFont(11), WHITE, 0.85);
    let trend = eloTrend(c);
    let diff = addColumn(row, 30);
    let diffRow = diff.addStack();
    diffRow.centerAlignContent();
    addSymbol(diffRow, trend.symbol, 7, trend.color);
    diffRow.addSpacer(2);
    addLabel(diffRow, trend.text, Font.semiboldMonospacedSystemFont(9), trend.color);
}

function buildSmall(widget, data) {
    addHeader(widget, data, true);
    widget.addSpacer(6);
    data.clubs.slice(0, 5).forEach((c, i) => {
        if (i > 0) widget.addSpacer(4);
        addSmallRow(widget, c);
    });
    widget.addSpacer();
}

function buildMedium(widget, data) {
    addHeader(widget, data, false);
    widget.addSpacer(6);
    let row = widget.addStack();
    [data.clubs.slice(0, 5), data.clubs.slice(5, 10)].forEach((list, i) => {
        if (i > 0) row.addSpacer(14);
        let col = row.addStack();
        col.layoutVertically();
        list.forEach((c, j) => {
            if (j > 0) col.addSpacer(4);
            addMediumRow(col, c);
        });
        col.addSpacer();
    });
    widget.addSpacer();
}

// In der App: mittleres Widget (Standardgröße)
const FAMILY = config.widgetFamily || "medium";

async function createWidget() {
    let data = await loadData();
    let widget = new ListWidget();
    widget.url = "http://clubelo.com/";
    widget.refreshAfterDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(12, 14, 4, 14);

    if (!data) {
        addHeader(widget, null, FAMILY !== "medium");
        widget.addSpacer(6);
        addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(11), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    if (FAMILY === "medium" || FAMILY === "large") buildMedium(widget, data);
    else buildSmall(widget, data);
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
