// Parkrun nah – die 5 nächstgelegenen parkruns (5 km, samstags) vom aktuellen Standort: Entfernung (Luftlinie),
// deine Bestzeit dort und wie oft du dort gestartet bist; oben deine Läufe insgesamt und deine Bestzeit.
// Deine parkrun-ID wird beim ersten Start in der App abgefragt und nur in der Keychain dieses iPhones gespeichert
// (nicht im Skript, nicht auf GitHub). Ändern: Skript in Scriptable starten → "parkrun-ID ändern".
// Quellen: Veranstaltungsliste von parkrun (images.parkrun.com/events.json) und deine öffentliche Ergebnisseite.
// Mittleres Widget. Antippen einer Zeile öffnet die Seite des parkruns.

const fm = FileManager.local();
const eventsPath = fm.joinPath(fm.documentsDirectory(), "parkrun-nah-events.json");
const statsPath = fm.joinPath(fm.documentsDirectory(), "parkrun-nah-ergebnisse.json");
const locationPath = fm.joinPath(fm.cacheDirectory(), "parkrun-nah-standort.json");
const ID_KEY = "parkrun_nah_id";
const COUNT = 5;
const HOUR = 3600000;

const WHITE = Color.white();
const APRICOT = new Color("#FFA300");

let STATUS = "";

// ---------- parkrun-ID (nur Keychain) ----------

function parkrunId() {
    return Keychain.contains(ID_KEY) ? Keychain.get(ID_KEY) : "";
}

async function askId() {
    let alert = new Alert();
    alert.title = "parkrun-ID";
    alert.message = "Deine Nummer vom parkrun-Barcode (z. B. A1234567). Sie wird nur in der Keychain dieses iPhones gespeichert.";
    alert.addTextField("A1234567", parkrunId() ? `A${parkrunId()}` : "");
    alert.addAction("Speichern");
    alert.addCancelAction("Abbrechen");
    if ((await alert.present()) !== 0) return false;
    let id = alert.textFieldValue(0).replace(/^\s*a/i, "").replace(/\D/g, "");
    if (!id) return false;
    Keychain.set(ID_KEY, id);
    if (fm.fileExists(statsPath)) fm.remove(statsPath);
    return true;
}

// ---------- Standort ----------

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
        return { lat: 47.7997, lon: 9.8888 };
    }
}

// ---------- Veranstaltungen ----------

function readJSON(path) {
    try { if (fm.fileExists(path)) return JSON.parse(fm.readString(path)); } catch (e) {}
    return null;
}

// Alle 5-km-parkruns weltweit (seriesid 1, ohne junior parkrun), kompakt gespeichert und wöchentlich erneuert
async function loadEvents() {
    let saved = readJSON(eventsPath);
    if (saved && saved.events && Date.now() - saved.time < 7 * 24 * HOUR) return saved.events;
    try {
        let req = new Request("https://images.parkrun.com/events.json");
        req.timeoutInterval = 20;
        let json = await req.loadJSON();
        let countries = json.countries || {};
        let events = ((json.events || {}).features || [])
            .filter(f => f.properties && f.properties.seriesid === 1 && f.geometry)
            .map(f => {
                let p = f.properties;
                let country = countries[String(p.countrycode)] || {};
                return {
                    slug: p.eventname,
                    name: p.EventShortName || p.EventLongName || p.eventname,
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    url: `https://${country.url || "www.parkrun.com"}/${p.eventname}/`,
                };
            });
        if (events.length) {
            fm.writeString(eventsPath, JSON.stringify({ time: Date.now(), events }));
            return events;
        }
    } catch (e) {
        console.log(`Veranstaltungen: ${e}`);
    }
    return saved ? saved.events : [];
}

// ---------- Deine Ergebnisse ----------

function cleanText(html) {
    return String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, " ").trim();
}

function seconds(time) {
    return time.split(":").map(Number).reduce((sum, n) => sum * 60 + n, 0);
}

function formatTime(sec) {
    let pad = n => String(n).padStart(2, "0");
    let h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Ergebnisseite: je Lauf eine Zeile mit parkrun (Link ".../<name>/results/..."), Datum und Zeit.
// Daraus je parkrun Starts und Bestzeit; doppelte Zeilen (gleicher parkrun, gleiches Datum) zählen einmal.
function parseResults(html) {
    let seen = new Set();
    let events = {};
    for (let row of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
        let cells = (row.match(/<td[\s\S]*?<\/td>/gi) || []);
        if (cells.length < 3) continue;
        let link = /href=["'][^"']*?\/\/[^/"']+\/([a-z0-9-]+)\/results/i.exec(cells[0]);
        let texts = cells.map(cleanText);
        let date = texts.find(t => /^\d{2}\/\d{2}\/\d{4}$/.test(t));
        let time = texts.find(t => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t));
        if (!link || !date || !time) continue;
        let slug = link[1].toLowerCase();
        if (seen.has(`${slug}|${date}`)) continue;
        seen.add(`${slug}|${date}`);
        let e = events[slug] || (events[slug] = { runs: 0, best: null });
        e.runs++;
        let sec = seconds(time);
        if (e.best === null || sec < e.best) e.best = sec;
    }
    return events;
}

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function isResultPage(html, id) {
    return html.includes(String(id)) && /<table/i.test(html);
}

async function fetchResultPage(id) {
    let url = `https://www.parkrun.org.uk/parkrunner/${id}/all/`;
    let req = new Request(url);
    req.timeoutInterval = 15;
    req.headers = { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9,de;q=0.8" };
    let html = await req.loadString().catch(() => "");
    let status = req.response ? req.response.statusCode : 0;
    if (status === 200 && isResultPage(html, id)) return html;
    // In der App wie im normalen Browser öffnen (die Seite lädt manche Inhalte erst dort)
    if (!config.runsInWidget) {
        let wv = new WebView();
        await wv.loadURL(url);
        for (let i = 0; i < 10; i++) {
            html = await wv.evaluateJavaScript("document.documentElement.outerHTML");
            if (isResultPage(html, id)) return html;
            await new Promise(resolve => Timer.schedule(1000, false, resolve));
        }
    }
    throw new Error(`Ergebnisseite nicht abrufbar (HTTP ${status || "?"})`);
}

// Ergebnisse ändern sich nur samstags: dann stündlich neu, sonst höchstens einmal am Tag (in der App immer)
function statsDue(saved) {
    if (!saved || !config.runsInWidget) return true;
    let age = Date.now() - saved.time;
    let now = new Date();
    if (now.getDay() === 6 && now.getHours() >= 10 && now.getHours() < 20) return age > HOUR;
    return age > 20 * HOUR;
}

async function loadStats(id) {
    let saved = readJSON(statsPath);
    if (saved && saved.id !== id) saved = null;
    if (!statsDue(saved)) return saved;
    try {
        let events = parseResults(await fetchResultPage(id));
        let data = { id, time: Date.now(), events };
        fm.writeString(statsPath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Ergebnisse: ${e}`);
        STATUS = saved ? "offline" : "Ergebnisse nicht abrufbar";
        return saved;
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

// Feste Breite, zentriert – ohne flexiblen Abstand (der kostet in Scriptable mindestens 8 pt)
function addCell(stack, text, width, font, color = WHITE, opacity = 1) {
    let cell = stack.addStack();
    cell.size = new Size(width, 0);
    cell.centerAlignContent();
    return addLabel(cell, text, font, color, opacity);
}

function widgetWidth() {
    let w = Device.screenSize().width;
    return w >= 428 ? 364 : w >= 390 ? 338 : 329;
}

const COL = { dist: 44, best: 52, runs: 42 };
const PAD = 16;

function nameWidth() {
    return widgetWidth() - 2 * PAD - COL.dist - COL.best - COL.runs;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#4B2E83"), new Color("#24163F")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addHeader(widget, stats) {
    let header = widget.addStack();
    header.centerAlignContent();
    let sym = SFSymbol.named("figure.run");
    sym.applyFont(Font.systemFont(14));
    let img = header.addImage(sym.image);
    img.imageSize = new Size(14, 14);
    img.tintColor = APRICOT;
    header.addSpacer(6);
    addLabel(header, "parkrun", Font.semiboldSystemFont(14));
    header.addSpacer();
    let right = header.addStack();
    right.layoutVertically();
    let list = stats ? Object.values(stats.events) : [];
    let total = list.reduce((sum, e) => sum + e.runs, 0);
    let pb = list.reduce((min, e) => (e.best !== null && (min === null || e.best < min) ? e.best : min), null);
    let a = right.addStack();
    a.addSpacer();
    if (total) {
        addLabel(a, `${total} Läufe · PB `, Font.semiboldSystemFont(11), WHITE, 0.75);
        addLabel(a, formatTime(pb), Font.semiboldSystemFont(11), APRICOT);
    } else {
        addLabel(a, STATUS || (stats ? "noch keine Läufe" : ""), Font.semiboldSystemFont(11), WHITE, 0.75);
    }
    let b = right.addStack();
    b.addSpacer();
    let df = new DateFormatter();
    df.dateFormat = "dd.MM. HH:mm";
    let stamp = stats ? `${STATUS === "offline" ? "offline · " : ""}Stand ${df.string(new Date(stats.time))}` : "";
    addLabel(b, stamp, Font.mediumSystemFont(8), WHITE, 0.5);
    widget.addSpacer(4);
}

function addColumnTitles(widget) {
    let row = widget.addStack();
    let font = Font.semiboldSystemFont(9);
    let name = row.addStack();
    name.size = new Size(nameWidth(), 0);
    addLabel(name, "NÄCHSTGELEGEN", font, WHITE, 0.55);
    name.addSpacer();
    addCell(row, "ENTF.", COL.dist, font, WHITE, 0.55);
    addCell(row, "BESTZEIT", COL.best, font, WHITE, 0.55);
    addCell(row, "STARTS", COL.runs, font, WHITE, 0.55);
    widget.addSpacer(3);
}

function addEventRow(widget, event, mine) {
    let row = widget.addStack();
    row.centerAlignContent();
    row.size = new Size(0, 16);
    row.url = event.url;
    let visited = mine && mine.runs > 0;
    let name = row.addStack();
    name.size = new Size(nameWidth(), 0);
    addLabel(name, event.name, Font.semiboldSystemFont(12), WHITE, visited ? 1 : 0.75).minimumScaleFactor = 0.8;
    name.addSpacer();
    let km = event.km < 10 ? event.km.toFixed(1).replace(".", ",") : String(Math.round(event.km));
    addCell(row, `${km} km`, COL.dist, Font.mediumSystemFont(11), WHITE, 0.7);
    addCell(row, visited ? formatTime(mine.best) : "–", COL.best, Font.semiboldMonospacedSystemFont(11.5), visited ? APRICOT : WHITE, visited ? 1 : 0.45);
    addCell(row, visited ? `${mine.runs}×` : "–", COL.runs, Font.mediumSystemFont(11.5), WHITE, visited ? 0.9 : 0.45);
}

async function createWidget() {
    let widget = new ListWidget();
    widget.url = `${URLScheme.forRunningScript()}?aus=widget`;
    background(widget);
    widget.setPadding(10, PAD, 8, PAD);
    // Samstags während der Läufe und bis die Ergebnisse da sind öfter, sonst alle 3 Stunden (Standortwechsel)
    let now = new Date();
    let saturday = now.getDay() === 6 && now.getHours() >= 8 && now.getHours() < 20;
    widget.refreshAfterDate = new Date(Date.now() + (saturday ? 1 : 3) * HOUR);

    let id = parkrunId();
    if (!id) {
        addHeader(widget, null);
        widget.addSpacer(6);
        addLabel(widget, "parkrun-ID fehlt – Skript einmal in Scriptable starten und ID eingeben", Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 2;
        widget.addSpacer();
        return widget;
    }

    let [here, events] = await Promise.all([currentLocation(), loadEvents()]);
    let stats = await loadStats(id);
    addHeader(widget, stats);
    if (!events.length) {
        addLabel(widget, "parkrun-Liste nicht abrufbar – später erneut versuchen", Font.mediumSystemFont(12), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    addColumnTitles(widget);
    let nearest = events.map(e => ({ ...e, km: distanceKm(here, e) })).sort((a, b) => a.km - b.km).slice(0, COUNT);
    nearest.forEach((event, i) => {
        if (i > 0) widget.addSpacer(2);
        addEventRow(widget, event, stats && stats.events[event.slug]);
    });
    widget.addSpacer();
    return widget;
}

async function main() {
    // In der App: ohne ID (oder auf Wunsch) abfragen; Antippen des Widgets öffnet die App mit ?aus=widget – dann ohne Rückfrage
    let fromWidget = (args.queryParameters || {}).aus === "widget";
    if (!config.runsInWidget) {
        if (!parkrunId()) {
            await askId();
        } else if (!fromWidget) {
            let alert = new Alert();
            alert.title = "parkrun";
            alert.addAction("Widget anzeigen");
            alert.addAction("parkrun-ID ändern");
            if ((await alert.presentSheet()) === 1) await askId();
        }
    }
    let widget = await createWidget();
    if (config.runsInWidget) Script.setWidget(widget);
    else await widget.presentMedium();
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
