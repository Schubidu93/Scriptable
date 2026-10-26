// Schneehöhe München – Widget im Stil der iOS-Wetter-Widgets
// Unterstützt: klein, mittel sowie Sperrbildschirm (rund, rechteckig, inline)

const CONFIG = {
    location: "München",
    url: "https://www.hnd.bayern.de/schnee/inn/muenchen-stadt-10865",
    maxDepth: 50, // cm, bei dem der Balken im mittleren Widget voll ist
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "schnee-muenchen.json");

// Schneehöhe laden – bei Fehlern den letzten bekannten Wert verwenden
async function loadSnow() {
    try {
        let html = await new Request(CONFIG.url).loadString();
        let match = /Schneehöhe vom (.*?) Uhr: <b>(\d+)<\/b> cm/.exec(html);
        if (match) {
            let data = { depth: parseInt(match[2]), stand: match[1].trim(), stale: false };
            fm.writeString(cachePath, JSON.stringify(data));
            return data;
        }
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        return data;
    }
    return null;
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

function buildSmall(widget, data) {
    let white = Color.white();
    addHeader(widget, white);
    addDepth(widget, data, 48, white);
    widget.addSpacer();
    addFooter(widget, data, white);
}

function buildMedium(widget, data) {
    let white = Color.white();
    let row = widget.addStack();

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
    addLabel(title, "Schneehöhe", Font.semiboldSystemFont(13), white, 0.7);

    right.addSpacer();

    let big = right.addStack();
    big.addSpacer();
    addSymbol(big, data && data.depth > 0 ? "cloud.snow.fill" : "sun.max.fill", 44, white);

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
    widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

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
        case "large":
        case "extraLarge":
            background(widget);
            widget.setPadding(16, 16, 16, 16);
            buildMedium(widget, data);
            break;
        default:
            background(widget);
            widget.setPadding(16, 16, 16, 16);
            buildSmall(widget, data);
    }
    return widget;
}

let widget = await createWidget();
if (config.runsInWidget) {
    Script.setWidget(widget);
} else {
    await widget.presentSmall();
}
Script.complete();
