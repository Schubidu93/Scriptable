// Langlauf rund um Kißlegg oder im Großraum München – gespurte Loipen-Kilometer (klassisch / Skating), Schneehöhe
// und Stand. Die Region richtet sich nach dem Standort (näher an München oder an Kißlegg); als Widget-Parameter
// erzwingt "München" bzw. "Allgäu" eine Region. Gespurte Gebiete haben Vorrang (nach Entfernung),
// freie Plätze füllen die nächstgelegenen geschlossenen.
// Die Berichte sammelt stündlich ein GitHub-Workflow (scripts/langlauf.mjs); das Widget lädt die
// fertige Datei und merkt sich den letzten Stand. Mittleres Widget: 6 Gebiete, großes: 8 mit Hinweis.
// Antippen aktualisiert das Widget.

const DATA_URL = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/data/langlauf.json";
// Jedes Gebiet bringt seine Region und die Autostrecke (km) ab Rathaus Kißlegg bzw. Marienplatz mit
const REGIONS = {
    allgaeu: { title: "Loipen Allgäu", lat: 47.7886, lon: 9.8809 },
    muenchen: { title: "Loipen München", lat: 48.1374, lon: 11.5755 },
};
// Plätze: mittel 6, groß 8 (mit Hinweiszeile)
const SLOTS = { medium: 6, large: 8 };

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "langlauf.json");
const locationPath = fm.joinPath(fm.cacheDirectory(), "langlauf-ort.json");

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

// Luftlinie in km
function distanceKm(a, b) {
    let rad = x => x * Math.PI / 180;
    let h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

// Standort (grob, höchstens 10 s); ohne Freigabe/Empfang der zuletzt bekannte, sonst Kißlegg
async function currentLocation() {
    try {
        Location.setAccuracyToThreeKilometers();
        let loc = await Promise.race([Location.current(), new Promise((_, reject) => Timer.schedule(10000, false, () => reject(new Error("Zeitüberschreitung"))))]);
        let here = { lat: loc.latitude, lon: loc.longitude };
        fm.writeString(locationPath, JSON.stringify(here));
        return here;
    } catch (e) {
        console.log(`Standort nicht verfügbar: ${e}`);
        if (fm.fileExists(locationPath)) return JSON.parse(fm.readString(locationPath));
        return null;
    }
}

async function chooseRegion() {
    let param = (args.widgetParameter || "").toLowerCase();
    if (/m(ü|ue|u)nchen|muc/.test(param)) return "muenchen";
    if (/allg(ä|ae|a)u|ki(ß|ss)legg/.test(param)) return "allgaeu";
    let here = await currentLocation();
    if (!here) return "allgaeu";
    return distanceKm(here, REGIONS.muenchen) < distanceKm(here, REGIONS.allgaeu) ? "muenchen" : "allgaeu";
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

// Feste Breite, Text zentriert – ohne flexiblen Abstand, damit die ganze Breite für den Text bleibt
function addCenteredCell(stack, text, width, font, color = WHITE, opacity = 1) {
    let cell = stack.addStack();
    cell.size = new Size(width, 0);
    cell.centerAlignContent();
    return addLabel(cell, text, font, color, opacity);
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

function addHeader(widget, data, large, region) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "figure.skiing.crosscountry", 15);
    header.addSpacer(6);
    addLabel(header, REGIONS[region].title, Font.semiboldSystemFont(15));
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

// Breiten passend für das mittlere/große Widget (338 pt). Die Zahlenspalten sind zentriert ohne flexiblen Abstand
// (der kostet mindestens 8 pt – daran wurde "SCHNEE" zu "SCH…"); der gewonnene Platz geht an die Namen
const COL = { name: 104, classic: 46, skating: 48, snow: 44 };

function addColumnTitles(widget, large) {
    let row = widget.addStack();
    let font = Font.semiboldSystemFont(9);
    row.addSpacer(14);
    addCell(row, "GEBIET", large ? COL.name - 6 : COL.name, font, WHITE, 0.55);
    addCenteredCell(row, "KLASS.", COL.classic, font, WHITE, 0.55);
    addCenteredCell(row, "SKATING", COL.skating, font, WHITE, 0.55);
    if (large) addCenteredCell(row, "SCHNEE", COL.snow, font, WHITE, 0.55);
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
    addLabel(nameBox, area.name, Font.semiboldSystemFont(12), WHITE, open ? 1 : 0.8).minimumScaleFactor = large ? 0.75 : 0.85;
    if (large && area.km) {
        nameBox.addSpacer(4);
        addLabel(nameBox, `${Math.round(area.km)} km`, Font.mediumSystemFont(9), WHITE, 0.5);
    }
    nameBox.addSpacer();
    let num = Font.mediumSystemFont(11.5);
    if (area.classic === null || area.classic === undefined) {
        // Keine Kilometer (z. B. Vogt: Text-Bericht) – Kurzhinweis über beide Spalten
        let word = area.groomed ? `${km(area.groomed)} km gespurt` : open ? "gespurt"
            : area.status === "closed" ? "geschlossen" : "keine Info";
        addCenteredCell(row, word, COL.classic + COL.skating, Font.mediumSystemFont(11), WHITE, open ? 0.9 : 0.55);
    } else {
        addCenteredCell(row, `${km(area.classic)} km`, COL.classic, num, WHITE, area.classic ? 1 : 0.5);
        addCenteredCell(row, `${km(area.skating)} km`, COL.skating, num, WHITE, area.skating ? 1 : 0.5);
    }
    if (large) addCenteredCell(row, area.snow === null || area.snow === undefined ? "–" : `${area.snow} cm`, COL.snow, num, WHITE, area.snow ? 1 : 0.5);
    row.addSpacer();
    // "heute 12:07" ist die breiteste Angabe – lieber leicht schrumpfen als "…"
    addLabel(row, formatStand(area.updated), Font.mediumSystemFont(11), WHITE, area.stale ? 0.45 : 0.75).minimumScaleFactor = 0.8;
    (area.noteLines || []).forEach(text => {
        widget.addSpacer(1);
        let line = widget.addStack();
        line.addSpacer(14);
        addLabel(line, text, Font.regularSystemFont(10), WHITE, 0.6).minimumScaleFactor = 0.85;
        line.addSpacer();
    });
}

// Hinweis kürzen statt abschneiden: nur der erste Satz, ohne Smileys, von Hand auf höchstens zwei Zeilen
// umbrochen (iOS quetscht mehrzeilige Texte sonst zusammen oder setzt "…")
const NOTE_CHARS = 54;

function noteLines(note) {
    let text = String(note || "").replace(/\s*[:;]-?[)(DP]/g, "").replace(/\s+/g, " ").replace(/\s+([.!?])/g, "$1").trim();
    let first = text.match(/^.*?[.!?](?=\s|$)/);
    if (first && !/\d\.$/.test(first[0])) text = first[0];
    if (!text) return [];
    let lines = [""];
    for (let word of text.split(" ")) {
        let cur = lines[lines.length - 1];
        if (!cur) lines[lines.length - 1] = word;
        else if (cur.length + 1 + word.length <= NOTE_CHARS) lines[lines.length - 1] = `${cur} ${word}`;
        else lines.push(word);
    }
    // Mehr als zwei Zeilen kommen kaum vor (der Abruf kürzt auf ~105 Zeichen)
    if (lines.length > 2) lines = [lines[0], `${lines[1]} …`];
    return lines;
}

const FAMILY = config.widgetFamily || "medium";

// Auswahl: zuerst alle gespurten Gebiete nach Entfernung, freie Plätze dann mit den nächstgelegenen
// geschlossenen auffüllen; angezeigt wird in dieser Reihenfolge (gespurt vor geschlossen)
function pickAreas(areas, slots) {
    let dist = a => a.km || 999;
    let open = areas.filter(a => a.status === "open").sort((a, b) => dist(a) - dist(b));
    let rest = areas.filter(a => a.status !== "open").sort((a, b) => dist(a) - dist(b));
    return open.concat(rest).slice(0, slots);
}

async function createWidget() {
    let large = FAMILY === "large" || FAMILY === "extraLarge";
    let data = await loadData();
    let region = await chooseRegion();
    // Nur die Gebiete der Region (ältere Daten ohne Region gehören zum Allgäu)
    if (data) data.areas = data.areas.filter(a => (a.region || "allgaeu") === region);
    let widget = new ListWidget();
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);
    background(widget);
    widget.setPadding(large ? 14 : 11, 16, large ? 12 : 8, 16);

    addHeader(widget, data, large, region);
    if (!data) {
        addLabel(widget, "Keine Loipenberichte – später erneut versuchen", Font.mediumSystemFont(12), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    addColumnTitles(widget, large);
    let areas = pickAreas(data.areas, large ? SLOTS.large : SLOTS.medium);
    // Hinweise nur im großen Widget und nur so viele Zeilen, wie Platz ist (die nächsten Gebiete zuerst);
    // bei vielen Hinweiszeilen rücken die Gebiete enger zusammen
    let budget = 9, used = 0;
    areas = areas.map(area => {
        let lines = large ? noteLines(area.note) : [];
        if (used + lines.length > budget) lines = [];
        used += lines.length;
        return { ...area, noteLines: lines };
    });
    let gap = large ? (used > 4 ? 4 : 7) : 2;
    areas.forEach((area, i) => {
        if (i > 0) widget.addSpacer(gap);
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
