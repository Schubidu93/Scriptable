// Leichtathletik – die besten Leistungen der letzten Woche aus allen Disziplinen,
// nach World-Athletics-Punkten. Die Daten sammelt täglich ein GitHub-Workflow
// (scripts/leichtathletik_woche.mjs); das Widget lädt nur die fertige Datei.
// Großes Widget: Top 5 Frauen und Männer. Mittleres Widget: Top 3 nebeneinander.
//
// Region: weltweit (Standard) oder nur deutsche Athleten – im Loader per
// Function("REGION", code)("deutschland") oder als Widget-Parameter "deutschland".

const GERMANY = String((typeof REGION !== "undefined" && REGION) || args.widgetParameter || "").trim().toLowerCase() === "deutschland";
const DATA_URL = `https://raw.githubusercontent.com/Schubidu93/Scriptable/main/data/leichtathletik_woche${GERMANY ? "_ger" : ""}.json`;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `leichtathletik-woche${GERMANY ? "-ger" : ""}.json`);

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

async function loadData() {
    try {
        let data = await new Request(DATA_URL).loadJSON();
        if (data && (data.women || data.men)) {
            fm.writeString(cachePath, JSON.stringify(data));
            if (data.generated) UPDATED = new Date(data.generated).getTime();
            return data;
        }
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
    }
    if (fm.fileExists(cachePath)) {
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        if (data.generated) UPDATED = new Date(data.generated).getTime();
        return data;
    }
    return null;
}

// "Rebecca HENDERSON" → "R. Henderson"
function shortName(name) {
    let words = String(name || "").split(" ").filter(Boolean);
    let isSurname = w => w.length > 1 && w === w.toUpperCase();
    let last = words.filter(isSurname).map(w => w.charAt(0) + w.slice(1).toLowerCase()
        .replace(/[-'](\p{L})/gu, m => m.toUpperCase()));
    let first = words.filter(w => !isSurname(w));
    if (!last.length) return words.join(" ");
    return first.length ? `${first[0].charAt(0)}. ${last.join(" ")}` : last.join(" ");
}

// "Takahata Race Walk Course, Takahata (JPN)" → "Takahata"
function city(venue) {
    let parts = String(venue || "").replace(/\s*\(.*?\)\s*$/, "").split(",").map(p => p.trim()).filter(Boolean);
    return parts.length > 1 && /stadium|course|park|arena|track|field/i.test(parts[0]) ? parts[parts.length - 1] : parts[0] || "";
}

// "25 OCT 2026" → "25.10."
function shortDate(date) {
    let months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    let m = /(\d{1,2})\s+([A-Z]{3})/i.exec(date || "");
    if (!m) return date || "";
    return `${m[1].padStart(2, "0")}.${String(months.indexOf(m[2].toUpperCase()) + 1).padStart(2, "0")}.`;
}

// IOC-Kürzel → Flaggen-Emoji
const IOC_TO_ISO = {
    ALG: "DZ", ARG: "AR", AUS: "AU", AUT: "AT", BAH: "BS", BDI: "BI", BEL: "BE", BHR: "BH", BRN: "BH",
    BOT: "BW", BRA: "BR", BUL: "BG", CAN: "CA", CHI: "CL", CHN: "CN", CIV: "CI", COL: "CO", CRO: "HR",
    CUB: "CU", CZE: "CZ", DEN: "DK", DJI: "DJ", DOM: "DO", ECU: "EC", EGY: "EG", ERI: "ER", ESP: "ES",
    EST: "EE", ETH: "ET", FIN: "FI", FRA: "FR", GBR: "GB", GER: "DE", GHA: "GH", GRE: "GR", GRN: "GD",
    HUN: "HU", IND: "IN", INA: "ID", IRL: "IE", IRI: "IR", ISR: "IL", ITA: "IT", JAM: "JM", JPN: "JP",
    KAZ: "KZ", KEN: "KE", KOR: "KR", KSA: "SA", LAT: "LV", LCA: "LC", LES: "LS", LTU: "LT", MAR: "MA",
    MAS: "MY", MEX: "MX", MGL: "MN", NAM: "NA", NED: "NL", NGR: "NG", NOR: "NO", NZL: "NZ", PER: "PE",
    PHI: "PH", POL: "PL", POR: "PT", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA", RWA: "RW", SGP: "SG",
    SLO: "SI", SRB: "RS", SRI: "LK", SUD: "SD", SUI: "CH", SVK: "SK", SWE: "SE", SYR: "SY", TAN: "TZ",
    THA: "TH", TPE: "TW", TTO: "TT", TUN: "TN", TUR: "TR", UAE: "AE", UGA: "UG", UKR: "UA", USA: "US",
    UZB: "UZ", VEN: "VE", VIE: "VN", ZAM: "ZM", ZIM: "ZW",
};

function flag(ioc) {
    let iso = IOC_TO_ISO[ioc];
    return iso ? String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";
}

const WHITE = Color.white();
const GOLD = new Color("#FFD66B");

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
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    img.imageSize = new Size(size, size);
    img.tintColor = color;
    return img;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#0E7C86"), new Color("#073B4C")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addHeader(widget, data) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "figure.run", 14, WHITE);
    header.addSpacer(5);
    addLabel(header, GERMANY ? "Leichtathletik 🇩🇪" : "Leichtathletik", Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let info = data ? `Top-Leistungen · ${data.days} Tage${data.stale ? " · offline" : ""}` : "";
    addLabel(header, info, Font.semiboldSystemFont(11), WHITE, 0.6);
}

// Zwei Zeilen pro Leistung: Name und Punkte, darunter Disziplin, Leistung, Ort, Datum
function addPerformance(stack, p, compact) {
    let top = stack.addStack();
    top.centerAlignContent();
    let rank = top.addStack();
    rank.size = new Size(compact ? 12 : 14, 0);
    addLabel(rank, `${p.rank}`, Font.semiboldMonospacedSystemFont(compact ? 10 : 11), WHITE, 0.6);
    let f = GERMANY ? "" : flag(p.nat);
    addLabel(top, `${f ? f + " " : ""}${shortName(p.name)}`, Font.semiboldSystemFont(compact ? 12 : 13), WHITE);
    top.addSpacer(4);
    top.addSpacer();
    addLabel(top, `${p.score}`, Font.boldRoundedSystemFont(compact ? 12 : 13), GOLD);

    let bottom = stack.addStack();
    bottom.addSpacer(compact ? 12 : 14);
    let details = compact
        ? `${p.event} · ${p.mark}`
        : `${p.event} · ${p.mark}${p.wind ? ` (${p.wind})` : ""} · ${city(p.venue)} · ${shortDate(p.date)}`;
    addLabel(bottom, details, Font.mediumSystemFont(compact ? 9 : 10), WHITE, 0.65);
}

function addSection(stack, title, list, count, compact) {
    addLabel(stack, title.toUpperCase(), Font.semiboldSystemFont(10), WHITE, 0.6);
    if (!list || !list.length) {
        stack.addSpacer(3);
        addLabel(stack, "Keine Leistungen", Font.mediumSystemFont(11), WHITE, 0.7);
        return;
    }
    list.slice(0, count).forEach(p => {
        stack.addSpacer(compact ? 3 : 4);
        addPerformance(stack, p, compact);
    });
}

function buildLarge(widget, data) {
    addHeader(widget, data);
    widget.addSpacer(8);
    addSection(widget, "Frauen", data.women, 5, false);
    widget.addSpacer(10);
    addSection(widget, "Männer", data.men, 5, false);
    widget.addSpacer();
}

function buildMedium(widget, data) {
    addHeader(widget, data);
    widget.addSpacer(6);
    let row = widget.addStack();
    let left = row.addStack();
    left.layoutVertically();
    addSection(left, "Frauen", data.women, 3, true);
    left.addSpacer();
    row.addSpacer(14);
    let right = row.addStack();
    right.layoutVertically();
    addSection(right, "Männer", data.men, 3, true);
    right.addSpacer();
}

async function createWidget() {
    let data = await loadData();
    let widget = new ListWidget();
    widget.url = "https://worldathletics.org/records/toplists";
    widget.refreshAfterDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(14, 16, 6, 16);

    if (!data) {
        addHeader(widget, null);
        widget.addSpacer(6);
        addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(13), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    if (config.widgetFamily === "medium") buildMedium(widget, data);
    else buildLarge(widget, data);
    addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        await widget.presentLarge();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
