// Bahn – die nächsten drei Direktverbindungen zwischen Kißlegg und München (ohne Umstieg), mit Verspätung.
// Richtung nach Standort: näher an Kißlegg → Kißlegg–München, näher an München → München–Kißlegg.
// Als Widget-Parameter erzwingt "nach münchen" bzw. "nach kißlegg" eine Richtung.
// Gezeigt werden die frühesten drei Verbindungen, die höchstens eine Stunde vor jetzt abfahren
// (auch schon abgefahrene, solange sie unterwegs sind – mit Verspätung).
// Quelle: Fahrplanauskunft von bahn.de, direkt vom iPhone abgefragt. Mittleres Widget.

const STATIONS = {
    kisslegg: { name: "Kißlegg", query: "Kißlegg", lat: 47.7886, lon: 9.8809 },
    muenchen: { name: "München Hbf", short: "München", query: "München Hbf", lat: 48.1402, lon: 11.5600 },
};
const API = "https://www.bahn.de/web/api/";
const HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "de-DE,de;q=0.9",
    "Content-Type": "application/json; charset=utf-8",
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "bahn-verbindungen.json");
const stationPath = fm.joinPath(fm.cacheDirectory(), "bahn-bahnhoefe.json");
const locationPath = fm.joinPath(fm.cacheDirectory(), "bahn-ort.json");

const WHITE = Color.white();
const GREEN = new Color("#34C759");
const YELLOW = new Color("#FFD60A");
const RED = new Color("#FF453A");
const MINUTE = 60000;

let UPDATED = Date.now();

// ---------- Richtung ----------

function distanceKm(a, b) {
    let rad = x => x * Math.PI / 180;
    let h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

// Standort grob (höchstens 10 s); ohne Freigabe der zuletzt bekannte, sonst Kißlegg
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

async function chooseDirection() {
    let param = (args.widgetParameter || "").toLowerCase();
    if (/nach\s*m(ü|ue|u)nchen/.test(param)) return ["kisslegg", "muenchen"];
    if (/nach\s*ki(ß|ss|s)legg/.test(param)) return ["muenchen", "kisslegg"];
    let here = await currentLocation();
    if (here && distanceKm(here, STATIONS.muenchen) < distanceKm(here, STATIONS.kisslegg)) return ["muenchen", "kisslegg"];
    return ["kisslegg", "muenchen"];
}

// ---------- bahn.de ----------

async function request(path, body) {
    let req = new Request(API + path);
    req.timeoutInterval = 15;
    req.headers = HEADERS;
    if (body) {
        req.method = "POST";
        req.body = JSON.stringify(body);
    }
    let text = await req.loadString();
    let status = req.response && req.response.statusCode;
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (status !== 200 || !json) {
        throw new Error(`bahn.de ${status || "?"}${json && json.code ? " " + json.code : ""}`);
    }
    return json;
}

// Bahnhofs-Kennung (lid) über die Ortssuche, einmal ermittelt und gespeichert
async function stationId(key) {
    let saved = {};
    try { if (fm.fileExists(stationPath)) saved = JSON.parse(fm.readString(stationPath)); } catch (e) {}
    if (saved[key]) return saved[key];
    let list = await request(`reiseloesung/orte?suchbegriff=${encodeURIComponent(STATIONS[key].query)}&typ=ALL&limit=5`);
    let hit = list.find(o => o.type === "ST") || list[0];
    if (!hit || !hit.id) throw new Error(`${STATIONS[key].name} nicht gefunden`);
    saved[key] = hit.id;
    fm.writeString(stationPath, JSON.stringify(saved));
    return hit.id;
}

// "2026-10-29T09:42:00" in deutscher Ortszeit
function localStamp(date) {
    let pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function journeyBody(from, to, when) {
    return {
        abfahrtsHalt: from, ankunftsHalt: to, anfrageZeitpunkt: localStamp(when), ankunftSuche: "ABFAHRT",
        klasse: "KLASSE_2",
        produktgattungen: ["ICE", "EC_IC", "IR", "REGIONAL", "SBAHN", "BUS", "SCHIFF", "UBAHN", "TRAM", "ANRUFPFLICHTIG"],
        reisende: [{ typ: "ERWACHSENER", ermaessigungen: [{ art: "KEINE_ERMAESSIGUNG", klasse: "KLASSENLOS" }], alter: [], anzahl: 1 }],
        schnelleVerbindungen: true, sitzplatzOnly: false, bikeCarriage: false, reservierungsKontingenteVorhanden: false,
        nurDeutschlandTicketVerbindungen: false, deutschlandTicketVorhanden: false,
        maxUmstiege: 0,
    };
}

// Eine Verbindung ohne Umstieg: Zug, Gleis, Plan- und Echtzeiten, Ausfall
function parseJourney(v) {
    let legs = (v.verbindungsAbschnitte || []).filter(a => a.verkehrsmittel && a.verkehrsmittel.typ !== "WALK"
        && !/fu(ß|ss)weg|transfer/i.test(a.verkehrsmittel.typ || ""));
    if (legs.length !== 1) return null;
    let leg = legs[0];
    let first = (leg.halte || [])[0] || {};
    let last = (leg.halte || [])[(leg.halte || []).length - 1] || {};
    let text = JSON.stringify(v);
    let cancelled = Boolean(v.cancelled || leg.cancelled || first.canceled || first.cancelled
        || /"(canceled|cancelled)":true|Halt entfällt|fällt (heute )?aus/i.test(text));
    let vm = leg.verkehrsmittel;
    return {
        train: vm.mittelText || vm.kurzText || vm.name || "Zug",
        dep: leg.abfahrtsZeitpunkt,
        depReal: leg.ezAbfahrtsZeitpunkt || null,
        arr: leg.ankunftsZeitpunkt,
        arrReal: leg.ezAnkunftsZeitpunkt || null,
        platform: first.ezGleis || first.gleis || null,
        cancelled,
    };
}

async function loadJourneys(fromKey, toKey) {
    let [from, to] = await Promise.all([stationId(fromKey), stationId(toKey)]);
    let since = new Date(Date.now() - 60 * MINUTE);
    let json = await request("angebote/fahrplan", journeyBody(from, to, since));
    let list = (json.verbindungen || []).map(parseJourney).filter(Boolean)
        .filter(j => new Date(j.dep).getTime() >= since.getTime() - MINUTE)
        .sort((a, b) => new Date(a.dep) - new Date(b.dep));
    // Weniger als drei: später weitersuchen (nächste Seite)
    if (list.length < 3 && json.spaeterContext) {
        try {
            let more = await request("angebote/fahrplan", { ...journeyBody(from, to, since), pagingReference: json.spaeterContext });
            let seen = new Set(list.map(j => j.dep + j.train));
            (more.verbindungen || []).map(parseJourney).filter(Boolean).forEach(j => { if (!seen.has(j.dep + j.train)) list.push(j); });
        } catch (e) {
            console.log(`Weitere Verbindungen: ${e}`);
        }
    }
    return list.slice(0, 3);
}

async function loadData() {
    let [fromKey, toKey] = await chooseDirection();
    try {
        let journeys = await loadJourneys(fromKey, toKey);
        let data = { from: fromKey, to: toKey, journeys, updated: Date.now() };
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
        if (fm.fileExists(cachePath)) {
            let data = JSON.parse(fm.readString(cachePath));
            // Zwischenspeicher nur für dieselbe Richtung
            if (data.from === fromKey) {
                data.stale = true;
                data.error = String(e.message || e);
                return data;
            }
        }
        return { from: fromKey, to: toKey, journeys: [], error: String(e.message || e) };
    }
}

// ---------- Darstellung ----------

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
    let sym = SFSymbol.named(name) || SFSymbol.named("tram.fill");
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    let natural = sym.image.size;
    img.imageSize = new Size(natural.height ? size * natural.width / natural.height : size, size);
    img.tintColor = color;
    return img;
}

function hhmm(iso) {
    let d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Verspätung in Minuten (null = keine Echtzeit)
function delay(planned, real) {
    if (!real) return null;
    return Math.round((new Date(real) - new Date(planned)) / MINUTE);
}

function delayColor(min) {
    if (min === null) return WHITE;
    return min <= 0 ? GREEN : min <= 5 ? YELLOW : RED;
}

// Feste Breite, Text links
function addCell(stack, width) {
    let cell = stack.addStack();
    cell.size = new Size(width, 0);
    cell.centerAlignContent();
    return cell;
}

// Zeit mit Verspätung: "09:42 +5" (pünktlich grün "+0", ohne Echtzeit nur die Zeit)
function addTime(stack, planned, real, width, strike) {
    let cell = addCell(stack, width);
    let d = delay(planned, real);
    let t = addLabel(cell, hhmm(planned), Font.semiboldMonospacedSystemFont(14), WHITE, strike ? 0.45 : 1);
    if (d !== null && !strike) {
        cell.addSpacer(3);
        addLabel(cell, d > 0 ? `+${d}` : "+0", Font.boldMonospacedSystemFont(11), delayColor(d));
    }
    cell.addSpacer();
    return t;
}

function addJourney(widget, j) {
    let now = Date.now();
    let departed = new Date(j.depReal || j.dep).getTime() < now;
    let arrived = new Date(j.arrReal || j.arr).getTime() < now;
    let row = widget.addStack();
    row.centerAlignContent();
    // Abfahrt, Ankunft, Zug, Gleis bzw. Status
    addTime(row, j.dep, j.depReal, 66, j.cancelled);
    addSymbol(row, "arrow.right", 9, WHITE).imageOpacity = 0.5;
    row.addSpacer(6);
    addTime(row, j.arr, j.arrReal, 66, j.cancelled);
    let train = addCell(row, 74);
    addLabel(train, j.train, Font.mediumSystemFont(11), WHITE, 0.8).minimumScaleFactor = 0.8;
    train.addSpacer();
    row.addSpacer();
    let status, color = WHITE, opacity = 0.6;
    if (j.cancelled) { status = "fällt aus"; color = RED; opacity = 1; }
    else if (arrived) status = "angekommen";
    else if (departed) { status = "unterwegs"; opacity = 0.8; }
    else status = j.platform ? `Gl. ${j.platform}` : "";
    addLabel(row, status, Font.semiboldSystemFont(11), color, opacity);
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#C8102E"), new Color("#6E0A1B")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

async function createWidget() {
    let data = await loadData();
    let widget = new ListWidget();
    widget.url = URLScheme.forRunningScript();
    background(widget);
    widget.setPadding(12, 16, 6, 16);

    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "tram.fill", 14);
    header.addSpacer(6);
    let from = STATIONS[data.from], to = STATIONS[data.to];
    addLabel(header, `${from.short || from.name} → ${to.short || to.name}`, Font.semiboldSystemFont(15));
    header.addSpacer();
    addLabel(header, "direkt", Font.semiboldSystemFont(11), WHITE, 0.6);
    widget.addSpacer(8);

    if (!data.journeys.length) {
        addLabel(widget, data.error ? `Keine Verbindungen (${data.error})` : "Keine Direktverbindung gefunden",
            Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 2;
    }
    data.journeys.forEach((j, i) => {
        if (i > 0) widget.addSpacer(7);
        addJourney(widget, j);
    });
    widget.addSpacer();

    let footer = widget.addStack();
    footer.addSpacer();
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    UPDATED = data.updated || Date.now();
    addLabel(footer, `${data.stale ? "offline · " : ""}aktualisiert ${df.string(new Date(UPDATED))}`, Font.mediumSystemFont(8), WHITE, 0.5);

    // Alle 5 Minuten neu (iOS entscheidet selbst, wann genau)
    widget.refreshAfterDate = new Date(Date.now() + 5 * MINUTE);
    return widget;
}

async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) Script.setWidget(widget);
    else await widget.presentMedium();
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
