// Schneehöhe München – Widget im Stil der iOS-Wetter-Widgets
// Unterstützt: klein, mittel, groß (jeweils mit kleinen Säulen der letzten 24 Stunden) sowie Sperrbildschirm (rund, rechteckig, inline)

const CONFIG = {
    location: "München",
    url: "https://www.hnd.bayern.de/schnee/inn/muenchen-stadt-10865",
    maxDepth: 50, // cm, bei dem der Balken im mittleren Widget voll ist
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "schnee-muenchen.json");

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

// Schneehöhe laden – bei Fehlern den letzten bekannten Wert verwenden
async function loadSnow() {
    try {
        let html = await new Request(CONFIG.url).loadString();
        let match = /Schneehöhe vom (.*?) Uhr: <b>(\d+)<\/b> cm/.exec(html);
        if (match) {
            let data = { depth: parseInt(match[2]), stand: match[1].trim(), stale: false, updated: Date.now() };
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        if (data.updated) UPDATED = data.updated;
        return data;
    }
    return null;
}

// Verlauf: Messwerttabelle der Station (alle 10 Minuten, neueste zuerst) – davon die letzten 24 Stunden
async function loadHistory() {
    try {
        let html = await new Request(`${CONFIG.url}/tabelle`).loadString();
        let points = [];
        for (let row of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
            let cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
            let d = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(cells[0] || "");
            if (!d) continue;
            let time = new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]), Number(d[4]), Number(d[5]));
            let value = /^\d+$/.test(cells[1] || "") ? Number(cells[1]) : null;
            points.push({ time: time.getTime(), value });
        }
        let since = Date.now() - 24 * 3600000;
        return points.filter(p => p.time >= since).sort((a, b) => a.time - b.time);
    } catch (e) {
        console.log(`Verlauf nicht geladen: ${e}`);
        return [];
    }
}

// Stundenwerte der letzten 24 Stunden (je Stunde der letzte Messwert, ohne Messung null)
function hourly(points) {
    let now = Date.now();
    return Array.from({ length: 24 }, (_, i) => {
        let from = now - (24 - i) * 3600000, to = from + 3600000;
        let inHour = points.filter(p => p.time >= from && p.time < to && p.value !== null);
        return inHour.length ? inHour[inHour.length - 1].value : null;
    });
}

// Kleine Säulen wie die Niederschlagsvorschau der iOS-Wetter-Widgets: 24 Stunden, ganz rechts jetzt.
// Ohne Schnee nur ein flacher Strich je Stunde, ohne Messung ein Punkt.
function barsImage(values, width, height) {
    let ctx = new DrawContext();
    ctx.size = new Size(width, height);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    let peak = Math.max(0, ...values.filter(v => v !== null));
    let max = Math.max(5, peak);
    let slot = width / values.length, bar = Math.max(1.5, slot * 0.6);
    values.forEach((v, i) => {
        let x = i * slot + (slot - bar) / 2;
        let h = v === null ? 1.5 : Math.max(1.5, (v / max) * height);
        let rect = new Rect(x, height - h, bar, h);
        let path = new Path();
        path.addRoundedRect(rect, Math.min(bar / 2, h / 2), Math.min(bar / 2, h / 2));
        ctx.addPath(path);
        ctx.setFillColor(new Color("#ffffff", v === null ? 0.2 : v > 0 ? 0.95 : 0.4));
        ctx.fillPath();
    });
    return ctx.getImage();
}

function addBars(stack, values, width, height) {
    let img = stack.addImage(barsImage(values, width, height));
    img.imageSize = new Size(width, height);
}

// Großes Widget, unten: "LETZTE 24 STUNDEN" mit Höchstwert, kleine Säulen, Zeitachse
function addHistory(widget, values, white) {
    let known = values.filter(v => v !== null);
    let peak = known.length ? Math.max(...known) : 0;

    let rule = widget.addStack();
    rule.size = new Size(0, 1);
    rule.backgroundColor = new Color("#ffffff", 0.25);
    rule.addSpacer();
    widget.addSpacer(8);

    let head = widget.addStack();
    head.centerAlignContent();
    addLabel(head, "LETZTE 24 STUNDEN", Font.semiboldSystemFont(11), white, 0.7);
    head.addSpacer();
    addLabel(head, known.length ? `max. ${peak} cm` : "keine Messwerte", Font.semiboldSystemFont(11), white, 0.7);
    widget.addSpacer(6);

    let width = 300, height = 28;
    let row = widget.addStack();
    addBars(row, values, width, height);
    widget.addSpacer(3);

    let times = widget.addStack();
    times.size = new Size(width, 0);
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    let at = h => df.string(new Date(Date.now() - h * 3600000));
    addLabel(times, at(24), Font.mediumSystemFont(9), white, 0.6);
    times.addSpacer();
    addLabel(times, at(12), Font.mediumSystemFont(9), white, 0.6);
    times.addSpacer();
    addLabel(times, "jetzt", Font.mediumSystemFont(9), white, 0.6);
}

function describe(depth) {
    if (depth === 0) return "Kein Schnee";
    if (depth < 5) return "Leichte Schneedecke";
    if (depth < 15) return "Geschlossene Schneedecke";
    if (depth < 30) return "Viel Schnee";
    return "Tiefer Schnee";
}

// "26.10.2026 07:00" → "07:00"
function shortStand(stand) {
    let time = /(\d{1,2}:\d{2})/.exec(stand || "");
    return time ? time[1] : stand;
}

function symbol(name, size) {
    let sym = SFSymbol.named(name);
    sym.applyFont(Font.systemFont(size));
    return sym.image;
}

function addSymbol(stack, name, size, color) {
    let img = stack.addImage(symbol(name, size));
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

// Kapselförmiger Füllstandsbalken
function gaugeImage(depth, width, height) {
    let ctx = new DrawContext();
    ctx.size = new Size(width, height);
    ctx.opaque = false;
    ctx.respectScreenScale = true;

    let track = new Path();
    track.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
    ctx.addPath(track);
    ctx.setFillColor(new Color("#ffffff", 0.25));
    ctx.fillPath();

    let fraction = Math.min(depth / CONFIG.maxDepth, 1);
    if (fraction > 0) {
        let w = Math.max(height, width * fraction);
        let fill = new Path();
        fill.addRoundedRect(new Rect(0, 0, w, height), height / 2, height / 2);
        ctx.addPath(fill);
        ctx.setFillColor(Color.white());
        ctx.fillPath();
    }
    return ctx.getImage();
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#5B8FD6"), new Color("#2E5EA8")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// Kopfzeile: "München ➤"
function addHeader(stack, white) {
    let header = stack.addStack();
    header.centerAlignContent();
    addLabel(header, CONFIG.location, Font.semiboldSystemFont(15), white);
    header.addSpacer(4);
    addSymbol(header, "location.fill", 10, white);
}

// Große Zahl mit "cm"
function addDepth(stack, data, size, white) {
    let row = stack.addStack();
    row.bottomAlignContent();
    addLabel(row, data ? `${data.depth}` : "–", Font.lightSystemFont(size), white);
    row.addSpacer(2);
    let unit = row.addStack();
    unit.layoutVertically();
    addLabel(unit, "cm", Font.regularSystemFont(size * 0.38), white);
    unit.addSpacer(size * 0.14);
}

// Fußzeile: Symbol + Beschreibung, darunter Stand
function addFooter(stack, data, white) {
    let line = stack.addStack();
    line.centerAlignContent();
    let snowy = data && data.depth > 0;
    addSymbol(line, snowy ? "snowflake" : "sun.max.fill", 13, white);
    line.addSpacer(4);
    addLabel(line, data ? describe(data.depth) : "Keine Daten", Font.semiboldSystemFont(13), white);

    stack.addSpacer(1);
    let info = data
        ? `Stand ${shortStand(data.stand)}${data.stale ? " · offline" : ""}`
        : "Später erneut versuchen";
    addLabel(stack, info, Font.semiboldSystemFont(13), white, 0.7);
}

function buildSmall(widget, data, values) {
    let white = Color.white();
    addHeader(widget, white);
    addDepth(widget, data, 44, white);
    widget.addSpacer();
    // Kleine Säulen: Schneehöhe der letzten 24 Stunden
    if (values) {
        addBars(widget, values, 126, 14);
        widget.addSpacer(5);
    }
    addFooter(widget, data, white);
}

// height: feste Höhe (großes Widget), damit der Verlauf darunter seinen Platz behält
function buildMedium(widget, data, height, values) {
    let white = Color.white();
    let row = widget.addStack();
    if (height) row.size = new Size(0, height);

    let left = row.addStack();
    left.layoutVertically();
    addHeader(left, white);
    addDepth(left, data, 48, white);
    left.addSpacer();
    addFooter(left, data, white);

    row.addSpacer();

    let right = row.addStack();
    right.layoutVertically();
    right.size = new Size(130, 0);

    let title = right.addStack();
    title.addSpacer();
    addLabel(title, values ? "Letzte 24 h" : "Schneehöhe", Font.semiboldSystemFont(13), white, 0.7);

    right.addSpacer();

    // Statt des großen Symbols die Säulen der letzten 24 Stunden (ohne Verlauf das Symbol)
    let big = right.addStack();
    big.addSpacer();
    if (values) {
        addBars(big, values, 130, 30);
    } else {
        addSymbol(big, data && data.depth > 0 ? "cloud.snow.fill" : "sun.max.fill", 44, white);
    }

    right.addSpacer();

    let depth = data ? data.depth : 0;
    let gauge = right.addImage(gaugeImage(depth, 130, 6));
    gauge.imageSize = new Size(130, 6);
    right.addSpacer(4);

    let scale = right.addStack();
    addLabel(scale, "0", Font.semiboldSystemFont(11), white, 0.7);
    scale.addSpacer();
    addLabel(scale, `${CONFIG.maxDepth}+ cm`, Font.semiboldSystemFont(11), white, 0.7);
}

function buildCircular(widget, data) {
    let col = widget.addStack();
    col.layoutVertically();
    let top = col.addStack();
    top.addSpacer();
    addSymbol(top, "snowflake", 14, Color.white());
    top.addSpacer();
    let mid = col.addStack();
    mid.addSpacer();
    addLabel(mid, data ? `${data.depth}` : "–", Font.semiboldRoundedSystemFont(20), Color.white());
    mid.addSpacer();
    let bottom = col.addStack();
    bottom.addSpacer();
    addLabel(bottom, "cm", Font.mediumSystemFont(10), Color.white(), 0.8);
    bottom.addSpacer();
}

function buildRectangular(widget, data) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "snowflake", 12, Color.white());
    header.addSpacer(4);
    addLabel(header, CONFIG.location, Font.semiboldSystemFont(14), Color.white());
    addLabel(widget, data ? `${data.depth} cm Schnee` : "Keine Daten", Font.mediumSystemFont(14), Color.white());
    if (data) addLabel(widget, `Stand ${shortStand(data.stand)}`, Font.regularSystemFont(13), Color.white(), 0.7);
}

async function createWidget() {
    let data = await loadSnow();
    let family = config.widgetFamily || "small";
    let widget = new ListWidget();
    widget.url = CONFIG.url;
    widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

    switch (family) {
        case "accessoryInline":
            widget.addText(data ? `❄︎ ${data.depth} cm · ${CONFIG.location}` : "❄︎ Keine Daten");
            break;
        case "accessoryCircular":
            widget.addAccessoryWidgetBackground = true;
            buildCircular(widget, data);
            break;
        case "accessoryRectangular":
            buildRectangular(widget, data);
            break;
        case "medium":
            background(widget);
            widget.setPadding(16, 16, 6, 16);
            buildMedium(widget, data, 0, hourly(await loadHistory()));
            addUpdated(widget);
            break;
        case "large":
        case "extraLarge":
            // Oben wie das mittlere Widget, unten der Verlauf der letzten 24 Stunden
            background(widget);
            widget.setPadding(16, 16, 6, 16);
            buildMedium(widget, data, 130);
            widget.addSpacer(14);
            addHistory(widget, hourly(await loadHistory()), Color.white());
            widget.addSpacer();
            addUpdated(widget);
            break;
        default:
            background(widget);
            widget.setPadding(16, 16, 6, 16);
            buildSmall(widget, data, hourly(await loadHistory()));
            addUpdated(widget);
    }
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        await widget.presentSmall();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
