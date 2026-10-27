// Straßenlauf – die 3 besten Ergebnisse der letzten 90 Tage (Frauen & Männer),
// wahlweise nur Deutschland (Standard) oder weltweit
// Quelle: World Athletics All-Time-Toplist. Mittleres Widget, im Stil der iOS-Widgets.
//
// Strecke wählen: "marathon" (Standard), "halbmarathon" oder "10km" –
// entweder im Loader per Function("DISTANZ", code)("10km")
// oder als Widget-Parameter (Widget bearbeiten → Parameter).
//
// Region wählen: "deutschland" (Standard) oder "welt" –
// im Loader per Function("DISTANZ", "REGION", code)("10km", "welt")
// oder im Widget-Parameter, z. B. "halbmarathon welt".

const DISTANCES = {
    marathon: {
        title: "Marathon",
        path: "marathon",
        eventIds: { women: "10229534", men: "10229634" },
        gradient: ["#F2994A", "#D9480F"],
    },
    halbmarathon: {
        title: "Halbmarathon",
        path: "half-marathon",
        eventIds: { women: "10229541", men: "10229633" },
        gradient: ["#B56CE0", "#6A3FB5"],
    },
    "10km": {
        title: "10 km",
        path: "10-kilometres",
        eventIds: { women: "10229537", men: "10229507" },
        gradient: ["#3CC48A", "#16855A"],
    },
};

const REGIONS = {
    deutschland: { label: "🇩🇪", query: "regionType=countries&region=ger", cache: "ger" },
    welt: { label: "🌍", query: "regionType=world", cache: "welt" },
};

const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const distanceKey = String(
    (typeof DISTANZ !== "undefined" && DISTANZ) || params.find(p => DISTANCES[p]) || "marathon"
).trim().toLowerCase();
const regionKey = String(
    (typeof REGION !== "undefined" && REGION) || params.find(p => REGIONS[p]) || "deutschland"
).trim().toLowerCase();
const DISTANCE = DISTANCES[distanceKey] || DISTANCES.marathon;
const REGION_INFO = REGIONS[regionKey] || REGIONS.deutschland;
const WORLD = REGION_INFO === REGIONS.welt;

const CONFIG = {
    days: 90,
    count: 3,
    lists: [
        { title: "Frauen", gender: "women", eventId: DISTANCE.eventIds.women },
        { title: "Männer", gender: "men", eventId: DISTANCE.eventIds.men },
    ],
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `strasse-${REGION_INFO.cache}-${DISTANCE.path}.json`);

function isoDate(date) {
    let pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function listUrl(list) {
    let today = new Date();
    let from = new Date(today.getTime() - CONFIG.days * 24 * 60 * 60 * 1000);
    return `https://worldathletics.org/records/all-time-toplists/road-running/${DISTANCE.path}/all/`
        + `${list.gender}/senior?${REGION_INFO.query}&page=1&bestResultsOnly=false`
        + `&firstDay=${isoDate(from)}&lastDay=${isoDate(today)}&maxResultsByCountry=all`
        + `&eventId=${list.eventId}&ageCategory=senior`;
}

function cleanCell(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/\s+/g, " ")
        .trim();
}

// Tabelle über die Spaltenüberschriften auslesen – unabhängig von CSS-Klassen
function parseResults(html) {
    let table = (html.match(/<table[\s\S]*?<\/table>/gi) || []).find(t => /Competitor/i.test(t));
    if (!table) return [];

    let headers = (table.match(/<th[\s\S]*?<\/th>/gi) || []).map(h => cleanCell(h).toLowerCase());
    let col = name => headers.findIndex(h => h.startsWith(name));
    let idx = { mark: col("mark"), name: col("competitor"), venue: col("venue"), date: col("date") };
    idx.nat = col("nat") >= 0 ? col("nat") : col("country");

    let body = (table.match(/<tbody[\s\S]*?<\/tbody>/i) || [table])[0];
    return (body.match(/<tr[\s\S]*?<\/tr>/gi) || [])
        .map(row => (row.match(/<td[\s\S]*?<\/td>/gi) || []))
        .map(raw => ({ raw, cells: raw.map(cleanCell) }))
        .filter(({ cells }) => cells.length > idx.date && cells[idx.mark])
        .map(({ raw, cells }) => ({
            mark: cells[idx.mark],
            name: cells[idx.name],
            venue: cells[idx.venue],
            date: cells[idx.date],
            nat: findNat(raw, cells, idx),
        }))
        .slice(0, CONFIG.count);
}

// Länderkürzel (IOC, z. B. "KEN") aus Text, Bild-Attributen oder Flaggen-Dateinamen
function natFromHtml(html) {
    let text = cleanCell(html);
    if (/^[A-Z]{3}$/.test(text)) return text;
    let attr = /(?:alt|title|data-[\w-]+)="([A-Z]{3})"/.exec(html);
    if (attr) return attr[1];
    let file = /flags?[^"']*?\/([a-z]{3})\.(?:svg|png|gif|jpe?g|webp)/i.exec(html);
    if (file) return file[1].toUpperCase();
    let cls = /class="[^"]*flag[^"]*\b([a-z]{3})\b[^"]*"/i.exec(html);
    return cls ? cls[1].toUpperCase() : "";
}

function findNat(raw, cells, idx) {
    if (idx.nat >= 0) {
        let nat = natFromHtml(raw[idx.nat]);
        if (nat) return nat;
    }
    // Ohne eigene Spalte: Flagge im Namensfeld oder eine Zelle, die nur aus dem Kürzel besteht
    let nat = natFromHtml(raw[idx.name] || "");
    if (nat) return nat;
    let skip = [idx.mark, idx.venue, idx.date];
    let cell = cells.findIndex((c, i) => !skip.includes(i) && /^[A-Z]{3}$/.test(c));
    return cell >= 0 ? cells[cell] : "";
}

// IOC-Kürzel → Flaggen-Emoji (Länder, die im Laufsport häufig vorkommen)
const IOC_TO_ISO = {
    ALG: "DZ", ARG: "AR", AUS: "AU", AUT: "AT", BAH: "BS", BEL: "BE", BHR: "BH", BRA: "BR",
    BDI: "BI", CAN: "CA", CHI: "CL", CHN: "CN", COL: "CO", CRO: "HR", CZE: "CZ", DEN: "DK",
    ECU: "EC", ERI: "ER", ESP: "ES", EST: "EE", ETH: "ET", FIN: "FI", FRA: "FR", GBR: "GB",
    GER: "DE", GRE: "GR", HUN: "HU", IND: "IN", IRL: "IE", ISR: "IL", ITA: "IT", JPN: "JP",
    KAZ: "KZ", KEN: "KE", KOR: "KR", LTU: "LT", LAT: "LV", MAR: "MA", MEX: "MX", MGL: "MN",
    NAM: "NA", NED: "NL", NOR: "NO", NZL: "NZ", PER: "PE", POL: "PL", POR: "PT", PRK: "KP",
    QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU", RWA: "RW", SLO: "SI", SRB: "RS", SUI: "CH",
    SVK: "SK", SWE: "SE", TAN: "TZ", TUN: "TN", TUR: "TR", UAE: "AE", UGA: "UG", UKR: "UA",
    USA: "US", VEN: "VE", ZIM: "ZW", BRN: "BH", DJI: "DJ", LES: "LS", SOM: "SO", SUD: "SD",
};

function flag(ioc) {
    let iso = IOC_TO_ISO[ioc];
    if (!iso) return "";
    return String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// Alle Listen laden – fällt eine aus, wird ihr letzter Stand verwendet
async function loadResults() {
    let cache = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : {};
    let results = await Promise.all(CONFIG.lists.map(async list => {
        try {
            let req = new Request(listUrl(list));
            req.headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
            let entries = parseResults(await req.loadString());
            cache[list.gender] = entries;
            return { ...list, entries, stale: false };
        } catch (e) {
            console.log(`${list.title}: Abruf fehlgeschlagen: ${e}`);
            return { ...list, entries: cache[list.gender] || null, stale: true };
        }
    }));
    fm.writeString(cachePath, JSON.stringify(cache));
    return results;
}

// "Melat Yisak KEJETA" → "M. Kejeta"
function shortName(name) {
    let words = name.split(" ").filter(Boolean);
    let isSurname = w => w.length > 1 && w === w.toUpperCase();
    let first = words.filter(w => !isSurname(w));
    let last = words.filter(isSurname).map(w => w.charAt(0) + w.slice(1).toLowerCase()
        .replace(/[-'](\p{L})/gu, m => m.toUpperCase()));
    if (!last.length) return name;
    return first.length ? `${first[0].charAt(0)}. ${last.join(" ")}` : last.join(" ");
}

// "Berlin (GER)" → "Berlin"
function shortVenue(venue) {
    return venue.replace(/\s*\(.*?\)\s*/g, "").trim();
}

// "28 SEP 2026" → "28.09."
function shortDate(date) {
    let months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    let m = /(\d{1,2})\s+([A-Z]{3})/i.exec(date);
    if (!m) return date;
    let month = months.indexOf(m[2].toUpperCase()) + 1;
    return `${m[1].padStart(2, "0")}.${String(month).padStart(2, "0")}.`;
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
    gradient.colors = DISTANCE.gradient.map(hex => new Color(hex));
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addColumn(stack, list, white) {
    let col = stack.addStack();
    col.layoutVertically();
    col.size = new Size(140, 0);

    addLabel(col, list.title.toUpperCase(), Font.semiboldSystemFont(11), white, 0.7);
    col.addSpacer(4);

    if (!list.entries || !list.entries.length) {
        addLabel(col, list.entries ? "Keine Ergebnisse" : "Keine Daten", Font.mediumSystemFont(13), white, 0.85);
        col.addSpacer();
        return;
    }

    list.entries.forEach((e, i) => {
        if (i > 0) col.addSpacer(5);
        let top = col.addStack();
        top.centerAlignContent();
        let emoji = WORLD ? flag(e.nat) : "";
        addLabel(top, `${emoji ? emoji + " " : ""}${shortName(e.name)}`, Font.semiboldSystemFont(13), white);
        top.addSpacer();
        addLabel(top, e.mark, Font.mediumMonospacedSystemFont(13), white);
        let nat = WORLD && e.nat && !flag(e.nat) ? `${e.nat} · ` : "";
        addLabel(col, `${nat}${shortVenue(e.venue)} · ${shortDate(e.date)}`, Font.mediumSystemFont(10), white, 0.7);
    });
    col.addSpacer();
}

function buildMedium(widget, results) {
    let white = Color.white();

    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "figure.run", 13, white);
    header.addSpacer(4);
    addLabel(header, `${DISTANCE.title} ${REGION_INFO.label}`, Font.semiboldSystemFont(15), white);
    header.addSpacer();
    let offline = results.some(r => r.stale) ? " · offline" : "";
    addLabel(header, `${CONFIG.days} Tage${offline}`, Font.semiboldSystemFont(11), white, 0.7);

    widget.addSpacer(8);

    let row = widget.addStack();
    results.forEach((list, i) => {
        if (i > 0) row.addSpacer(16);
        addColumn(row, list, white);
    });
}

async function createWidget() {
    let results = await loadResults();
    let widget = new ListWidget();
    widget.url = listUrl(CONFIG.lists[0]);
    widget.refreshAfterDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(16, 16, 16, 16);
    buildMedium(widget, results);
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
