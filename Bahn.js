// Bahn – die nächsten drei Direktverbindungen zwischen Kißlegg und München (ohne Umstieg), mit Verspätung.
// Richtung nach Standort: näher an Kißlegg → Kißlegg–München, näher an München → München–Kißlegg.
// Als Widget-Parameter erzwingt "nach münchen" bzw. "nach kißlegg" eine Richtung.
// Gezeigt werden die frühesten drei Verbindungen, die höchstens eine Stunde vor jetzt abfahren
// (auch schon abgefahrene, solange sie unterwegs sind – mit Verspätung).
// Quelle: offizielle Timetables-API der DB (DB API Marketplace, kostenlos). Einrichten: Skript in der App starten
// und Client ID sowie API Key eingeben – sie liegen nur in der Keychain dieses iPhones. Mittleres Widget.

const STATIONS = {
    kisslegg: { name: "Kißlegg", query: "Kißlegg", lat: 47.7886, lon: 9.8809 },
    // Die Allgäu-Züge fahren in München meist an den Gleisen 27–36 – bei der DB ein eigener Bahnhof
    muenchen: { name: "München Hbf", short: "München", query: "München Hbf", parts: ["München Hbf Gl.27-36"], lat: 48.1402, lon: 11.5600 },
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "bahn-verbindungen.json");
const stationPath = fm.joinPath(fm.cacheDirectory(), "bahn-bahnhoefe-v3.json");
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

// ---------- DB Timetables-API ----------
// Offizielle Schnittstelle der Deutschen Bahn (DB API Marketplace, kostenlos): Fahrplan je Bahnhof und Stunde
// (/plan) und alle bekannten Änderungen (/fchg: Verspätung, Gleis, Ausfall). Eine Direktverbindung ist ein Zug,
// dessen weiterer Laufweg ab dem Startbahnhof den Zielbahnhof enthält; die Ankunft steht im Fahrplan des Ziels
// unter derselben Fahrt-ID.

const KEY = { clientId: "db_api_client_id", apiKey: "db_api_key" };

function credentials() {
    let get = key => (Keychain.contains(key) ? Keychain.get(key) : "");
    return { clientId: get(KEY.clientId), apiKey: get(KEY.apiKey) };
}

async function setup() {
    let alert = new Alert();
    alert.title = "DB-Zugang einrichten";
    alert.message = "Client ID und API Key aus dem DB API Marketplace (Anwendung mit der API „Timetables“). "
        + "Sie werden nur in der Keychain dieses iPhones gespeichert.";
    let cred = credentials();
    alert.addTextField("Client ID", cred.clientId);
    alert.addSecureTextField("API Key", cred.apiKey);
    alert.addAction("Speichern");
    alert.addCancelAction("Abbrechen");
    if ((await alert.present()) !== 0) return false;
    let id = alert.textFieldValue(0).trim(), key = alert.textFieldValue(1).trim();
    if (!id || !key) return false;
    Keychain.set(KEY.clientId, id);
    Keychain.set(KEY.apiKey, key);
    fm.writeString(stationPath, "{}");
    return true;
}

const API = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/";
const planPath = fm.joinPath(fm.cacheDirectory(), "bahn-fahrplan.json");

async function request(path) {
    let cred = credentials();
    if (!cred.clientId || !cred.apiKey) throw new Error("Zugang fehlt – Skript in der App starten");
    let req = new Request(API + path);
    req.timeoutInterval = 15;
    req.headers = { "DB-Client-Id": cred.clientId, "DB-Api-Key": cred.apiKey, "Accept": "application/xml" };
    let text = await req.loadString();
    let status = req.response && req.response.statusCode;
    // 404 bei /plan: in dieser Stunde fährt nichts
    if (status === 404) return "";
    if (status !== 200) {
        // Begründung der DB mitgeben (z. B. "Subscription not found" bei fehlendem Timetables-Abo)
        let reason = String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
        let hint = status === 401 ? "Zugang prüfen" : status === 403 ? "Abo „Timetables“ prüfen" : "";
        throw new Error(`DB ${status || "?"} bei ${path.split("/")[0]}${hint ? " – " + hint : ""}${reason ? ": " + reason : ""}`);
    }
    return text;
}

function decodeXml(s) {
    return String(s || "").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
        .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function attrs(tag) {
    let out = {};
    for (let m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
    return out;
}

// <s id="…"><tl c="RE" n="57412"/><ar pt="…" pp="2" ppth="…"/><dp pt="…" pp="2" ppth="…" l="96"/></s>
function parseStops(xml) {
    let stops = {};
    for (let m of String(xml || "").matchAll(/<s\s([^>]*?)(?:\/>|>([\s\S]*?)<\/s>)/g)) {
        let s = attrs(m[1]);
        let inner = m[2] || "";
        let tl = /<tl\s([^>]*?)\/?>/.exec(inner);
        let ar = /<ar\s([^>]*?)\/?>/.exec(inner);
        let dp = /<dp\s([^>]*?)\/?>/.exec(inner);
        stops[s.id] = { id: s.id, tl: tl ? attrs(tl[1]) : {}, ar: ar ? attrs(ar[1]) : null, dp: dp ? attrs(dp[1]) : null };
    }
    return stops;
}

// Fahrt-ID ohne Halt-Nummer: "-7874571842864554321-2210290952-3" → "-7874571842864554321-2210290952"
const tripKey = id => String(id).replace(/-\d+$/, "");

// "2210290952" (yyMMddHHmm, deutsche Ortszeit) → Date
function parseTime(t) {
    if (!t) return null;
    return new Date(2000 + Number(t.slice(0, 2)), Number(t.slice(2, 4)) - 1, Number(t.slice(4, 6)), Number(t.slice(6, 8)), Number(t.slice(8, 10)));
}

const pad = n => String(n).padStart(2, "0");

// Bahnhof einmal suchen und speichern – samt Teilbahnhöfen: In München fahren die Regionalzüge ins Allgäu
// meist an den Gleisen 27–36, die bei der DB als eigener Bahnhof "München Hbf Gl.27-36" geführt werden
async function searchStations(pattern) {
    let xml = await request(`station/${encodeURIComponent(pattern)}`).catch(() => "");
    return [...String(xml).matchAll(/<station\s([^>]*?)\/?>/g)].map(m => attrs(m[1])).filter(x => x.eva && x.name);
}

function readStations() {
    try { if (fm.fileExists(stationPath)) return JSON.parse(fm.readString(stationPath)); } catch (e) {}
    return {};
}

async function station(key) {
    let saved = readStations();
    if (Array.isArray(saved[key]) && saved[key].length) return saved[key];
    let query = STATIONS[key].query;
    // Mit und ohne Platzhalter suchen ("München Hbf*" findet auch "München Hbf Gl.27-36")
    let list = (await searchStations(query)).concat(await searchStations(`${query}*`));
    for (let part of STATIONS[key].parts || []) list = list.concat((await searchStations(part)).filter(x => x.name === part));
    let parts = [];
    list.forEach(x => {
        if ((x.name === query || x.name.startsWith(query + " ")) && !parts.some(p => p.eva === x.eva)) parts.push({ eva: x.eva, name: x.name });
    });
    if (!parts.length && list[0]) parts = [{ eva: list[0].eva, name: list[0].name }];
    if (!parts.length) throw new Error(`${STATIONS[key].name} nicht gefunden`);
    saved[key] = parts;
    fm.writeString(stationPath, JSON.stringify(saved));
    return parts;
}

// Im Laufweg aufgetauchter, noch unbekannter Teilbahnhof (z. B. "München Hbf Gl.27-36"): nachschlagen und merken
async function addStationPart(key, name) {
    let saved = readStations();
    let list = saved[key] || [];
    if (list.some(p => p.name === name)) return list;
    let hit = (await searchStations(name)).find(x => x.name === name);
    if (!hit) return list;
    list.push({ eva: hit.eva, name: hit.name });
    saved[key] = list;
    fm.writeString(stationPath, JSON.stringify(saved));
    return list;
}

// Fahrplan einer Stunde – ändert sich kaum, daher bis zu 6 Stunden zwischengespeichert
let PLAN_CACHE = null;

async function plan(eva, date) {
    if (!PLAN_CACHE) {
        try { PLAN_CACHE = fm.fileExists(planPath) ? JSON.parse(fm.readString(planPath)) : {}; } catch (e) { PLAN_CACHE = {}; }
        for (let k of Object.keys(PLAN_CACHE)) if (Date.now() - PLAN_CACHE[k].time > 6 * 3600000) delete PLAN_CACHE[k];
    }
    let day = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    let key = `${eva}/${day}/${pad(date.getHours())}`;
    if (!PLAN_CACHE[key]) PLAN_CACHE[key] = { time: Date.now(), stops: parseStops(await request(`plan/${key}`)) };
    return PLAN_CACHE[key].stops;
}

async function plans(eva, from, hours) {
    let lists = await Promise.all(Array.from({ length: hours }, (_, i) => plan(eva, new Date(from.getTime() + i * 3600000))));
    return Object.assign({}, ...lists);
}

// Pläne/Änderungen mehrerer Teilbahnhöfe zusammenführen
async function plansAll(list, from, hours) {
    return Object.assign({}, ...(await Promise.all(list.map(st => plans(st.eva, from, hours)))));
}

async function changesAll(list) {
    let lists = await Promise.all(list.map(st => request(`fchg/${st.eva}`).then(parseStops).catch(() => ({}))));
    return Object.assign({}, ...lists);
}

async function loadJourneys(fromKey, toKey) {
    let [from, to] = await Promise.all([station(fromKey), station(toKey)]);
    // Ziel im Laufweg: jeder Halt, der so heißt wie das Ziel oder mit dessen Namen beginnt ("München Hbf Gl.27-36")
    let query = STATIONS[toKey].query;
    let isTarget = name => name === query || name.startsWith(query + " ") || to.some(st => st.name === name);
    let since = new Date(Date.now() - 60 * MINUTE);
    // Abfahrten ab vor einer Stunde bis in 11 Stunden (die Direktzüge fahren etwa alle zwei Stunden)
    let departures = Object.values(await plansAll(from, since, 12))
        .filter(s => s.dp && (s.dp.ppth || "").split("|").some(isTarget))
        .map(s => ({ ...s, depTime: parseTime(s.dp.pt) }))
        .filter(s => s.depTime >= since)
        .sort((a, b) => a.depTime - b.depTime)
        .slice(0, 3);
    if (!departures.length) return [];
    // Teilbahnhöfe des Ziels aus den Laufwegen ergänzen, damit dort die Ankunft gefunden wird
    let seenTargets = new Set(departures.flatMap(d => d.dp.ppth.split("|").filter(isTarget)));
    for (let name of seenTargets) if (!to.some(st => st.name === name)) to = await addStationPart(toKey, name);
    // Ankunft: Fahrplan des Ziels in den Stunden nach der jeweiligen Abfahrt, gleiche Fahrt-ID
    let first = departures[0].depTime, last = departures[departures.length - 1].depTime;
    let arrHours = Math.ceil((last - first) / 3600000) + 4;
    let [arrivals, depChanges, arrChanges] = await Promise.all([
        plansAll(to, new Date(first.getTime() + 3600000), arrHours),
        changesAll(from),
        changesAll(to),
    ]);
    let byTrip = {};
    Object.values(arrivals).forEach(s => { if (s.ar) byTrip[tripKey(s.id)] = s; });
    let iso = d => (d ? localStamp(d) : null);
    let parsed = departures.map(s => {
        let dc = (depChanges[s.id] || {}).dp || {};
        let arr = byTrip[tripKey(s.id)];
        let ac = arr ? ((arrChanges[arr.id] || {}).ar || {}) : {};
        let train = `${s.tl.c || ""} ${s.dp.l || s.tl.n || ""}`.trim();
        return {
            train: train || "Zug",
            dep: iso(s.depTime),
            depReal: iso(parseTime(dc.ct)),
            arr: arr && arr.ar && arr.ar.pt ? iso(parseTime(arr.ar.pt)) : null,
            arrReal: iso(parseTime(ac.ct)),
            platform: dc.cp || s.dp.pp || null,
            cancelled: dc.cs === "c" || ac.cs === "c",
        };
    });
    PLAN_CACHE && fm.writeString(planPath, JSON.stringify(PLAN_CACHE));
    return parsed;
}

// "2026-10-29T09:42:00" in deutscher Ortszeit
function localStamp(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
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
// Breite für "12:34 +12" samt Mindestbreite des Abstandhalters (vorher 66 pt – die Uhrzeit wurde zu "12:…")
const TIME_W = 78;

function addTime(stack, planned, real, width, strike) {
    let cell = addCell(stack, width);
    let d = delay(planned, real);
    let t = addLabel(cell, hhmm(planned), Font.semiboldMonospacedSystemFont(13), WHITE, strike ? 0.45 : 1);
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
    let arrived = j.arr ? new Date(j.arrReal || j.arr).getTime() < now : false;
    let row = widget.addStack();
    row.centerAlignContent();
    // Abfahrt, Ankunft, Zug, Gleis bzw. Status
    addTime(row, j.dep, j.depReal, TIME_W, j.cancelled);
    addSymbol(row, "arrow.right", 9, WHITE).imageOpacity = 0.5;
    row.addSpacer(6);
    if (j.arr) addTime(row, j.arr, j.arrReal, TIME_W, j.cancelled);
    else addLabel(addCell(row, TIME_W), "–", Font.semiboldMonospacedSystemFont(14), WHITE, 0.5);
    let train = addCell(row, 64);
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
    widget.url = `${URLScheme.forRunningScript()}?aus=widget`;
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
            Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 4;
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
    // In der App: ohne Zugang (oder auf Wunsch) einrichten
    // (Antippen des Widgets öffnet die App mit ?aus=widget – dann ohne Rückfrage)
    let fromWidget = (args.queryParameters || {}).aus === "widget";
    if (!config.runsInWidget) {
        let cred = credentials();
        if (!cred.clientId || !cred.apiKey) {
            await setup();
        } else if (!fromWidget) {
            let alert = new Alert();
            alert.title = "Bahn";
            alert.addAction("Verbindungen anzeigen");
            alert.addAction("DB-Zugang ändern");
            if ((await alert.presentSheet()) === 1) await setup();
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
