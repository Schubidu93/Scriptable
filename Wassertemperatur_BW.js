// Wassertemperaturen – Widget im Stil der iOS-Wetter-Widgets
// Unterstützt: klein, mittel sowie Sperrbildschirm (rechteckig, inline)

const SOURCES = [
    {
        name: "Obersee",
        url: "https://www.wetteronline.de/wassertemperatur-badeseen/baden-wuerttemberg",
        parse: html => {
            let match = html.match(/Obersee\/Kißlegg[\s\S]*?<td class="ttcol">\s*(\d+)\s*&deg;C/i);
            return match ? parseFloat(match[1]) : null;
        },
    },
    {
        name: "Eisbach",
        url: "https://www.gkd.bayern.de/de/fluesse/wassertemperatur/kelheim/muenchen-himmelreichbruecke-16515005/messwerte",
        parse: html => {
            let match = html.match(/<td\s+class="center">(\d+,\d+)<\/td>/);
            return match ? parseFloat(match[1].replace(",", ".")) : null;
        },
    },
    {
        name: "Feringasee",
        url: "https://wasserwacht-unterföhring.de/aktuelles-wetter/",
        parse: html => {
            let match = html.match(/<b>(\d+\.\d+)<\/b>\s*Grad Celius im Wasser/i);
            return match ? Math.round(parseFloat(match[1]) * 10) / 10 : null;
        },
    },
];

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "wassertemperatur.json");

// Alle Quellen parallel laden – fällt eine aus, wird ihr letzter Wert verwendet
async function loadTemperatures() {
    let cache = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : {};
    let results = await Promise.all(SOURCES.map(async source => {
        try {
            let temp = source.parse(await new Request(source.url).loadString());
            if (temp !== null) {
                cache[source.name] = temp;
                return { name: source.name, temp, stale: false };
            }
        } catch (e) {
            console.log(`${source.name}: Abruf fehlgeschlagen: ${e}`);
        }
        let cached = cache[source.name];
        return { name: source.name, temp: cached ?? null, stale: cached != null };
    }));
    fm.writeString(cachePath, JSON.stringify(cache));
    return results;
}

function formatTemp(temp) {
    return temp === null ? "–" : `${temp.toFixed(1).replace(".", ",")}°`;
}

function feeling(temp) {
    if (temp === null) return "Keine Daten";
    if (temp < 12) return "Eiskalt";
    if (temp < 17) return "Frisch";
    if (temp < 21) return "Erfrischend";
    if (temp < 24) return "Angenehm";
    return "Badewanne";
}

function addSymbol(stack, name, size, color) {
    let sym = SFSymbol.named(name);
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
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

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#3FA9D6"), new Color("#1D6FA8")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// Kopfzeile: "Wasser 💧"
function addHeader(stack, white) {
    let header = stack.addStack();
    header.centerAlignContent();
    addLabel(header, "Wasser", Font.semiboldSystemFont(15), white);
    header.addSpacer(4);
    addSymbol(header, "drop.fill", 11, white);
    header.addSpacer();
}

function stamp(results) {
    let time = new DateFormatter();
    time.useNoDateStyle();
    time.useShortTimeStyle();
    let offline = results.some(r => r.stale) ? " · offline" : "";
    return `Stand ${time.string(new Date())}${offline}`;
}

function buildSmall(widget, results) {
    let white = Color.white();
    addHeader(widget, white);
    widget.addSpacer();

    results.forEach((r, i) => {
        if (i > 0) widget.addSpacer(6);
        let row = widget.addStack();
        row.centerAlignContent();
        addLabel(row, r.name, Font.semiboldSystemFont(13), white, 0.85);
        row.addSpacer();
        addLabel(row, formatTemp(r.temp), Font.mediumSystemFont(20), white);
    });

    widget.addSpacer();
    addLabel(widget, stamp(results), Font.semiboldSystemFont(11), white, 0.7);
}

function buildMedium(widget, results) {
    let white = Color.white();
    let top = widget.addStack();
    top.centerAlignContent();
    addHeader(top, white);
    addLabel(top, stamp(results), Font.semiboldSystemFont(11), white, 0.7);

    widget.addSpacer();

    let row = widget.addStack();
    results.forEach((r, i) => {
        if (i > 0) row.addSpacer();
        let col = row.addStack();
        col.layoutVertically();
        addLabel(col, r.name, Font.semiboldSystemFont(13), white, 0.85);
        addLabel(col, formatTemp(r.temp), Font.lightSystemFont(36), white);
        let line = col.addStack();
        line.centerAlignContent();
        addSymbol(line, "water.waves", 11, white);
        line.addSpacer(3);
        addLabel(line, feeling(r.temp), Font.semiboldSystemFont(11), white, 0.85);
    });

    widget.addSpacer();
}

function buildRectangular(widget, results) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "drop.fill", 11, Color.white());
    header.addSpacer(4);
    addLabel(header, "Wasser", Font.semiboldSystemFont(14), Color.white());
    results.forEach(r => {
        let row = widget.addStack();
        addLabel(row, r.name, Font.regularSystemFont(13), Color.white(), 0.8);
        row.addSpacer();
        addLabel(row, formatTemp(r.temp), Font.semiboldSystemFont(13), Color.white());
    });
}

async function createWidget() {
    let results = await loadTemperatures();
    let family = config.widgetFamily || "small";
    let widget = new ListWidget();
    widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

    switch (family) {
        case "accessoryInline":
        case "accessoryCircular":
            widget.addText(results.map(r => `${r.name.slice(0, 3)} ${formatTemp(r.temp)}`).join(" "));
            break;
        case "accessoryRectangular":
            buildRectangular(widget, results);
            break;
        case "medium":
        case "large":
        case "extraLarge":
            background(widget);
            widget.setPadding(16, 16, 16, 16);
            buildMedium(widget, results);
            break;
        default:
            background(widget);
            widget.setPadding(16, 16, 16, 16);
            buildSmall(widget, results);
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
