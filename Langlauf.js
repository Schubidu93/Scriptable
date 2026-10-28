// Langlauf rund um Kißlegg – gespurte Loipen-Kilometer (klassisch / Skating), Schneehöhe und Stand
// für Vogt, Bad Waldsee, Leutkirch, Wangen, Isny, Argenbühl und Missen-Wilhams.
// Die Berichte sammelt stündlich ein GitHub-Workflow (scripts/langlauf.mjs); das Widget lädt die
// fertige Datei und merkt sich den letzten Stand. Mittleres Widget: 6 Gebiete, großes: alle mit Hinweis.
// Antippen aktualisiert das Widget.

const DATA_URL = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/data/langlauf.json";
// Luftlinie ab Kißlegg (km) – Reihenfolge im Widget: nächstes Gebiet zuerst
const DISTANCE = { vogt: 9, leutkirch: 11, wangen: 12, argenbuehl: 12, isny: 16, waldsee: 18, missen: 28 };
// Mittleres Widget: sechs Gebiete (Argenbühl nur im großen)
const MEDIUM_AREAS = ["vogt", "leutkirch", "wangen", "isny", "waldsee", "missen"];

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "langlauf.json");

const WHITE = Color.white();
const OPEN = new Color("#34C759");
const OLD = new Color("#FFD60A");
const CLOSED = new Color("#8E8E93");
const UNKNOWN = new Color("#8E8E93", 0.5);

let UPDATED = Date.now();

async function loadData() {
    try {
        let req = new Request(`${DATA_URL}?t=${Math.floor(Date.now() / 600000)}`);
        req.timeoutInterval = 15;
        let data = await req.loadJSON();
        if (data && data.areas && data.areas.length) {
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
    } catch (e) {
        console.log(`Laden fehlgeschlagen: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        return data;
    }
    return null;
}

function addLabel(stack, text, font, color = WHITE, opacity = 1) {
    let t = stack.addText(String(text));
    t.font = font;
    t.textColor = color;
    t.textOpacity = opacity;
    t.lineLimit = 1;
    t.minimumScaleFactor = 1;
    return t;
}

function addSymbol(stack, name, size, color = WHITE) {
    let sym = SFSymbol.named(name) || SFSymbol.named("snowflake");
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    let natural = sym.image.size;
    img.imageSize = new Size(natural.height ? size * natural.width / natural.height : size, size);
    img.tintColor = color;
    return img;
}

// Feste Breite, Text links oder rechts (rechts über Ziffern-Leerzeichen in Festbreitenschrift)
function addCell(stack, text, width, font, color = WHITE, opacity = 1) {
    let cell = stack.addStack();
    cell.size = new Size(width, 0);
    let t = addLabel(cell, text, font, color, opacity);
    cell.addSpacer();
    return t;
}

const DAY = 86400000;

function dayStart(date) {
    let d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// "heute 12:07", "gestern", "22.03."
function formatStand(iso) {
    if (!iso) return "–";
    let date = new Date(iso);
    let days = Math.round((dayStart(new Date()) - dayStart(date)) / DAY);
    let time = /T\d/.test(iso) ? ` ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "";
    if (days === 0) return `heute${time}`;
    if (days === 1) return "gestern";
    let pad = n => String(n).padStart(2, "0");
    // Älter als ein knappes Jahr (z. B. Bad Waldsee 03.12.2023): mit Jahr, damit es nicht aktuell wirkt
    let year = days > 300 ? String(date.getFullYear()).slice(2) : "";
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${year}`;
}

// Ampel: grün = gespurt und Bericht höchstens 2 Tage alt, gelb = gespurt, aber älter, grau = zu / unbekannt
function statusColor(area) {
    if (area.status !== "open") return area.status === "closed" ? CLOSED : UNKNOWN;
    let age = area.updated ? (Date.now() - new Date(area.updated).getTime()) / DAY : 99;
    return age <= 2.5 ? OPEN : OLD;
}

function km(value) {
    if (value === null || value === undefined) return "–";
    return value === 0 ? "0" : String(Math.round(value * 10) / 10).replace(".", ",");
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#4A90C2"), new Color("#163B5C")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addHeader(widget, data, large) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "figure.skiing.crosscountry", 15);
    header.addSpacer(6);
    addLabel(header, "Loipen Allgäu", Font.semiboldSystemFont(15));
    header.addSpacer();
    let open = data ? data.areas.filter(a => a.status === "open").length : 0;
    let info = data ? (open ? `${open} gespurt` : "nichts gespurt") : "";
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    let stamp = data && data.stale ? "offline" : `aktualisiert ${df.string(new Date(UPDATED))}`;
    let right = header.addStack();
    right.layoutVertically();
    let a = right.addStack();
    a.addSpacer();
    addLabel(a, info, Font.semiboldSystemFont(11), WHITE, 0.75);
    let b = right.addStack();
    b.addSpacer();
    addLabel(b, stamp, Font.mediumSystemFont(8), WHITE, 0.5);
    widget.addSpacer(large ? 8 : 4);
}

// Breiten passend für das mittlere/große Widget (338 pt); jede Zelle mit ~8 pt Reserve gegen „…“
const COL = { name: 98, classic: 50, skating: 52, snow: 38 };

function addColumnTitles(widget, large) {
    let row = widget.addStack();
    let font = Font.semiboldSystemFont(9);
    row.addSpacer(14);
    addCell(row, "GEBIET", large ? COL.name - 6 : COL.name, font, WHITE, 0.55);
    addCell(row, "KLASS.", COL.classic, font, WHITE, 0.55);
    addCell(row, "SKATING", COL.skating, font, WHITE, 0.55);
    if (large) addCell(row, "SCHNEE", COL.snow, font, WHITE, 0.55);
    row.addSpacer();
    addLabel(row, "STAND", font, WHITE, 0.55);
    widget.addSpacer(2);
}

function addAreaRow(widget, area, large) {
    let row = widget.addStack();
    row.centerAlignContent();
    addLabel(row, "●", Font.boldSystemFont(10), statusColor(area));
    row.addSpacer(5);
    let open = area.status === "open";
    // Lange Namen („Missen-Wilhams“) dürfen minimal schrumpfen statt abgeschnitten zu werden
    let nameBox = row.addStack();
    nameBox.size = new Size(large ? COL.name - 6 : COL.name, 0);
    nameBox.centerAlignContent();
    addLabel(nameBox, area.name, Font.semiboldSystemFont(12), WHITE, open ? 1 : 0.8).minimumScaleFactor = 0.85;
    if (large && DISTANCE[area.id]) {
        nameBox.addSpacer(4);
        addLabel(nameBox, `${DISTANCE[area.id]} km`, Font.mediumSystemFont(9), WHITE, 0.5);
    }
    nameBox.addSpacer();
    let num = Font.mediumSystemFont(11.5);
    if (area.classic === null || area.classic === undefined) {
        // Keine Kilometer (z. B. Vogt: Text-Bericht) – Kurzhinweis über beide Spalten
        let word = area.groomed ? `${km(area.groomed)} km gespurt` : open ? "gespurt"
            : area.status === "closed" ? "geschlossen" : "keine Info";
        let span = addCell(row, word, COL.classic + COL.skating, Font.mediumSystemFont(11), WHITE, open ? 0.9 : 0.55);
        span.lineLimit = 1;
    } else {
        addCell(row, `${km(area.classic)} km`, COL.classic, num, WHITE, area.classic ? 1 : 0.5);
        addCell(row, `${km(area.skating)} km`, COL.skating, num, WHITE, area.skating ? 1 : 0.5);
    }
    if (large) addCell(row, area.snow === null || area.snow === undefined ? "–" : `${area.snow} cm`, COL.snow, num, WHITE, area.snow ? 1 : 0.5);
    row.addSpacer();
    addLabel(row, formatStand(area.updated), Font.mediumSystemFont(11), WHITE, area.stale ? 0.45 : 0.75);
    if (large && area.note) {
        widget.addSpacer(1);
        let line = widget.addStack();
        line.addSpacer(14);
        let t = addLabel(line, area.note, Font.regularSystemFont(10), WHITE, 0.6);
        t.lineLimit = 1;
    }
}

const FAMILY = config.widgetFamily || "medium";

async function createWidget() {
    let large = FAMILY === "large" || FAMILY === "extraLarge";
    let data = await loadData();
    let widget = new ListWidget();
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
    background(widget);
    widget.setPadding(large ? 14 : 11, 16, large ? 12 : 8, 16);

    addHeader(widget, data, large);
    if (!data) {
        addLabel(widget, "Keine Loipenberichte – später erneut versuchen", Font.mediumSystemFont(12), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    addColumnTitles(widget, large);
    let areas = (large ? data.areas : data.areas.filter(a => MEDIUM_AREAS.includes(a.id)))
        .slice().sort((a, b) => (DISTANCE[a.id] || 99) - (DISTANCE[b.id] || 99));
    areas.forEach((area, i) => {
        if (i > 0) widget.addSpacer(large ? 7 : 2);
        addAreaRow(widget, area, large);
    });
    widget.addSpacer();
    return widget;
}

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
