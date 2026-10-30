// Gipfel – die nächsten Berggipfel vom aktuellen Standort aus (mindestens 30 m über dir) und die markantesten im Umkreis (OpenStreetMap, natural=peak mit Namen):
// Name, Höhe, Entfernung (Luftlinie) und Richtungspfeil; daneben ein Haken, wenn eine deiner Strava-/Garmin-
// Aktivitäten auf 50 m an den Gipfel heranführte, sonst klein dein geringster Abstand (ohne Strava: Himmelsrichtung) (Strava-Zugang des Strava-Widgets;
// abgeglichen wird in der App, z. B. nach Antippen – das Widget liest nur das Ergebnis).
// Die Gipfel kommen von Wikidata (ersatzweise OpenStreetMap über die Overpass-API); neu gefragt wird erst, wenn du dich mehr als 1 km bewegt hast
// (sonst nur Entfernung und Richtung neu berechnet). Mittleres Widget: 8 Gipfel, großes: 15.

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const RADIUS = 40000; // Umkreis in Metern
const FAMILY = config.widgetFamily || "medium";
const LARGE = FAMILY === "large" || FAMILY === "extraLarge";
// Mittel: 8 Gipfel kompakt (ohne Fußzeile), groß: 15
const SIZE = LARGE
    ? { count: 15, name: 13, num: 12, dir: 11, arrow: 13, gap: 3, header: 15, headerGap: 8, footer: true }
    : { count: 8, name: 11.5, num: 10.5, dir: 9.5, arrow: 11, gap: 1, header: 13, headerGap: 3, footer: false };
const COUNT = SIZE.count;
// Davon markante Gipfel im Umkreis (mit Wikipedia-Artikel); die übrigen sind die nächsten mit MIN_ABOVE m über dir
const NOTABLE_COUNT = LARGE ? 5 : 3;
const MIN_ABOVE = 30;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "gipfel.json");
const locationPath = fm.joinPath(fm.cacheDirectory(), "gipfel-ort.json");

const WHITE = Color.white();
const ACCENT = new Color("#FFD60A");

// ---------- Standort ----------

async function currentLocation() {
    try {
        Location.setAccuracyToHundredMeters();
        let loc = await Promise.race([Location.current(), new Promise((_, reject) => Timer.schedule(10000, false, () => reject(new Error("Zeitüberschreitung"))))]);
        let here = { lat: loc.latitude, lon: loc.longitude, alt: loc.altitude, time: Date.now() };
        fm.writeString(locationPath, JSON.stringify(here));
        return here;
    } catch (e) {
        console.log(`Standort nicht verfügbar: ${e}`);
        if (fm.fileExists(locationPath)) return { ...JSON.parse(fm.readString(locationPath)), old: true };
        return null;
    }
}

const rad = x => x * Math.PI / 180;

function distanceKm(a, b) {
    let h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

// Kurs von a nach b in Grad (0 = Nord, 90 = Ost)
function bearing(a, b) {
    let y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    let x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const COMPASS = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = deg => COMPASS[Math.round(deg / 22.5) % 16];

// ---------- OpenStreetMap ----------

async function overpass(here, radius) {
    let query = `[out:json][timeout:20];node["natural"="peak"]["name"](around:${radius},${here.lat.toFixed(5)},${here.lon.toFixed(5)});out body;`;
    let lastError;
    for (let endpoint of config.runsInWidget ? ENDPOINTS.slice(0, 1) : ENDPOINTS) {
        try {
            let req = new Request(endpoint);
            req.method = "POST";
            // Auf dem Homescreen knapp (iOS bricht Widgets nach rund 30 s ab), in der App großzügig
            req.timeoutInterval = config.runsInWidget ? 10 : 30;
            req.headers = { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Scriptable-Gipfel-Widget" };
            req.body = `data=${encodeURIComponent(query)}`;
            let json = await req.loadJSON();
            if (json && Array.isArray(json.elements)) return json.elements;
            lastError = new Error(json && json.remark ? json.remark : "leere Antwort");
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("Overpass nicht erreichbar");
}

// Wikidata (Berge, Gipfel, Hügel mit Koordinate und Höhe, nach Entfernung) – schnell und zuverlässig erreichbar
// notable: nur Gipfel mit Wikipedia-Artikel (sitelinks), die bekanntesten zuerst – für "markant im Umkreis"
async function wikidata(here, radius, notable = false) {
    let query = `SELECT ?item ?label ?ele ?coord ?links WHERE {
 SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${here.lon.toFixed(5)} ${here.lat.toFixed(5)})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${radius / 1000}". bd:serviceParam wikibase:distance ?dist. }
 VALUES ?type { wd:Q8502 wd:Q207326 wd:Q54050 wd:Q1595289 }
 ?item wdt:P31 ?type.
 ?item wikibase:sitelinks ?links.
 ${notable ? "FILTER(?links > 0)" : ""}
 OPTIONAL { ?item wdt:P2044 ?ele. }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". ?item rdfs:label ?label. }
} ORDER BY ${notable ? "DESC(?links) DESC(?ele)" : "?dist"} LIMIT ${notable ? 40 : 120}`;
    let req = new Request(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
    req.timeoutInterval = config.runsInWidget ? 10 : 30;
    req.headers = { "Accept": "application/sparql-results+json", "User-Agent": "Scriptable-Gipfel-Widget/1.0 (github.com/Schubidu93/Scriptable)" };
    let json = await req.loadJSON();
    let seen = new Set();
    return json.results.bindings.map(b => {
        let m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
        return m && !/^Q\d+$/.test(b.label.value) ? { name: b.label.value, ele: b.ele ? Math.round(Number(b.ele.value)) : null,
            lat: Number(m[2]), lon: Number(m[1]), links: b.links ? Number(b.links.value) : 0 } : null;
    }).filter(p => p && !isSpotHeight(p.name) && !seen.has(p.name) && seen.add(p.name));
}

// Namenlose Höhenpunkte ("P.710", "Punkt 1234", "Pt. 812") sind keine Gipfel
const isSpotHeight = name => /^(p|pt|punkt|kote)\.?\s*\d+/i.test(String(name).trim());

// Platzhalter statt Namen ("Berg", "Höhe") – keine echten Gipfelnamen
const isGeneric = name => /^(berg|höhe|hoehe|hügel|huegel|gipfel|kuppe|anhöhe|bühl|buckel|kopf|spitze)$/i.test(String(name).trim());
const usable = p => p.name && !isSpotHeight(p.name) && !isGeneric(p.name);

// "1838", "1838 m", "1.838,5" → 1838
function elevation(tag) {
    if (!tag) return null;
    let m = /-?\d+(?:[.,]\d+)?/.exec(String(tag).replace(/(\d)\.(\d{3})\b/, "$1$2"));
    return m ? Math.round(Number(m[0].replace(",", "."))) : null;
}

async function loadPeaks(here) {
    let cached = null;
    try { if (fm.fileExists(cachePath)) cached = JSON.parse(fm.readString(cachePath)); } catch (e) {}
    // Gleicher Ort (unter 1 km) und höchstens eine Woche alt: gespeicherte Gipfel verwenden
    if (cached && cached.peaks && cached.version === 2 && distanceKm(here, cached.center) < 1 && Date.now() - cached.time < 7 * 86400000) return cached;
    try {
        // Zuerst Wikidata (antwortet in wenigen Sekunden), nur ersatzweise die oft überlasteten Overpass-Server
        let peaks = [], source = "Wikidata";
        try {
            peaks = await wikidata(here, RADIUS);
        } catch (e) {
            console.log(`Wikidata: ${e} – OpenStreetMap`);
            peaks = (await overpass(here, RADIUS)).map(e => ({
                name: e.tags["name:de"] || e.tags.name,
                ele: elevation(e.tags.ele),
                lat: e.lat,
                lon: e.lon,
            })).filter(p => !isSpotHeight(p.name));
            source = "OpenStreetMap";
        }
        // Markante Gipfel im Umkreis (mit Wikipedia-Artikel) – fehlt Wikidata, bleibt die Liste leer
        let notable = source === "Wikidata" ? await wikidata(here, RADIUS, true).catch(() => []) : [];
        let data = { version: 2, center: { lat: here.lat, lon: here.lon }, time: Date.now(), peaks, notable, source };
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Gipfel: ${e}`);
        if (cached) return { ...cached, stale: true };
        throw e;
    }
}

// ---------- Schon oben gewesen? (Strava) ----------
// Garmin bietet Privatleuten keine Schnittstelle; die Garmin-Aktivitäten landen aber in Strava. Genutzt wird der
// Strava-Zugang des Strava-Widgets (Keychain). Gespeichert werden je Aktivität nur die vereinfachte Route
// (summary_polyline) und ihr Umriss. Ein Gipfel gilt als bestiegen, wenn eine Route ihm auf 50 m nahe kommt.

const TOLERANCE_M = 50;
const tracksPath = fm.joinPath(fm.documentsDirectory(), "gipfel-strava-routen.json");
const STRAVA_KEY = {
    clientId: "strava_client_id", clientSecret: "strava_client_secret", refreshToken: "strava_refresh_token",
    accessToken: "strava_access_token", expiresAt: "strava_expires_at",
};

const keychain = key => (Keychain.contains(key) ? Keychain.get(key) : null);
const stravaConnected = () => Boolean(keychain(STRAVA_KEY.clientId) && keychain(STRAVA_KEY.clientSecret) && keychain(STRAVA_KEY.refreshToken));

async function stravaToken() {
    let token = keychain(STRAVA_KEY.accessToken);
    if (token && Number(keychain(STRAVA_KEY.expiresAt) || 0) * 1000 > Date.now() + 5 * 60000) return token;
    let req = new Request("https://www.strava.com/oauth/token");
    req.method = "POST";
    req.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    req.body = [["client_id", keychain(STRAVA_KEY.clientId)], ["client_secret", keychain(STRAVA_KEY.clientSecret)],
        ["grant_type", "refresh_token"], ["refresh_token", keychain(STRAVA_KEY.refreshToken)]]
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    let json = await req.loadJSON();
    if (!json.access_token) throw new Error("Strava-Anmeldung fehlgeschlagen");
    Keychain.set(STRAVA_KEY.accessToken, json.access_token);
    Keychain.set(STRAVA_KEY.refreshToken, json.refresh_token);
    Keychain.set(STRAVA_KEY.expiresAt, String(json.expires_at));
    return json.access_token;
}

// Google-Polyline → [[lat, lon], …]
function decodePolyline(str) {
    let points = [], index = 0, lat = 0, lon = 0;
    while (index < str.length) {
        for (let k = 0; k < 2; k++) {
            let result = 0, shift = 0, b;
            do {
                b = str.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20 && index < str.length);
            let delta = result & 1 ? ~(result >> 1) : result >> 1;
            if (k === 0) lat += delta; else lon += delta;
        }
        points.push([lat / 1e5, lon / 1e5]);
    }
    return points;
}

function readTracks() {
    try { if (fm.fileExists(tracksPath)) return JSON.parse(fm.readString(tracksPath)); } catch (e) {}
    return { last: 0, checked: 0, tracks: [] };
}

// Neue Aktivitäten nachladen (Strava liefert mit "after" aufsteigend). Im Widget höchstens eine Seite und nur
// stündlich, in der App alles (beim ersten Mal die ganze Historie)
async function syncTracks() {
    let store = readTracks();
    if (!stravaConnected()) return store;
    if (config.runsInWidget && Date.now() - store.checked < 3600000) return store;
    try {
        let token = await stravaToken();
        let pages = config.runsInWidget ? 1 : 100;
        for (let page = 0; page < pages; page++) {
            let req = new Request(`https://www.strava.com/api/v3/athlete/activities?after=${store.last}&per_page=200`);
            req.headers = { Authorization: `Bearer ${token}` };
            req.timeoutInterval = config.runsInWidget ? 8 : 30;
            let list = await req.loadJSON();
            if (!Array.isArray(list)) throw new Error(`Strava: ${JSON.stringify(list).slice(0, 120)}`);
            for (let a of list) {
                let poly = a.map && a.map.summary_polyline;
                store.last = Math.max(store.last, Math.floor(new Date(a.start_date).getTime() / 1000));
                if (!poly) continue;
                let pts = decodePolyline(poly);
                let lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
                store.tracks.push({ id: a.id, poly,
                    box: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)].map(v => Math.round(v * 1e4) / 1e4) });
            }
            if (list.length < 200) break;
        }
        store.checked = Date.now();
        fm.writeString(tracksPath, JSON.stringify(store));
    } catch (e) {
        console.log(`Strava: ${e}`);
    }
    return store;
}

// Kleinster Abstand (m) eines Punkts zu einer Route – Strecken zwischen den Routenpunkten mitgerechnet,
// weil die vereinfachte Route Punkte weglässt
function trackDistance(peak, points) {
    let kx = 111320 * Math.cos(rad(peak.lat)), ky = 110540;
    let xy = p => [(p[1] - peak.lon) * kx, (p[0] - peak.lat) * ky];
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
        let [ax, ay] = xy(points[i]);
        best = Math.min(best, ax * ax + ay * ay);
        if (i === 0) continue;
        let [bx, by] = xy(points[i - 1]);
        let dx = ax - bx, dy = ay - by, len = dx * dx + dy * dy;
        if (!len) continue;
        let t = Math.max(0, Math.min(1, -(bx * dx + by * dy) / len));
        let px = bx + t * dx, py = by + t * dy;
        best = Math.min(best, px * px + py * py);
    }
    return Math.sqrt(best);
}

// Geringster Abstand je Gipfel über alle Routen – geprüft werden nur Routen, deren Umriss den Gipfel mit
// NEAR_M Puffer enthält; weiter entfernt gilt als "nie in der Nähe" (Infinity)
const NEAR_M = 2000;

function closestApproach(peaks, store) {
    let decoded = {};
    let padLat = NEAR_M / 110540;
    return peaks.map(peak => {
        let padLon = NEAR_M / (111320 * Math.cos(rad(peak.lat)));
        let best = Infinity;
        for (let t of store.tracks) {
            if (peak.lat < t.box[0] - padLat || peak.lat > t.box[2] + padLat || peak.lon < t.box[1] - padLon || peak.lon > t.box[3] + padLon) continue;
            best = Math.min(best, trackDistance(peak, decoded[t.id] || (decoded[t.id] = decodePolyline(t.poly))));
            if (best === 0) break;
        }
        return best;
    });
}

// Ergebnis als kleine Liste "lat,lon" → Meter (das Widget liest nur diese)
const nearPath = fm.joinPath(fm.documentsDirectory(), "gipfel-abstand.json");
const peakKey = p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;

function saveApproach(peaks, store) {
    let known = readApproach();
    closestApproach(peaks, store).forEach((m, i) => {
        if (m <= NEAR_M) known[peakKey(peaks[i])] = Math.round(m);
    });
    fm.writeString(nearPath, JSON.stringify(known));
}

function readApproach() {
    try { if (fm.fileExists(nearPath)) return JSON.parse(fm.readString(nearPath)); } catch (e) {}
    return {};
}

// "12 m", "480 m", "1,4 km"
function formatApproach(m) {
    return m < 1000 ? `${Math.round(m / 10) * 10 || Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
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
    let sym = SFSymbol.named(name) || SFSymbol.named("mountain.2.fill");
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    let natural = sym.image.size;
    img.imageSize = new Size(natural.height ? size * natural.width / natural.height : size, size);
    img.tintColor = color;
    return img;
}

// Pfeil in Richtung des Gipfels (Norden oben), gradgenau gezeichnet: Schaft und Spitze, um den Kurs gedreht.
// DrawContext hat den Ursprung oben links (y nach unten) – im Uhrzeigersinn drehen heißt hier positiver Winkel.
function arrowImage(deg) {
    let size = 48, c = size / 2;
    let ctx = new DrawContext();
    ctx.size = new Size(size, size);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    let a = rad(deg);
    let rot = (x, y) => new Point(c + x * Math.cos(a) - y * Math.sin(a), c + x * Math.sin(a) + y * Math.cos(a));
    // Schaft von unten bis kurz vor die Spitze
    let shaft = new Path();
    shaft.move(rot(0, 19));
    shaft.addLine(rot(0, -6));
    ctx.addPath(shaft);
    ctx.setStrokeColor(WHITE);
    ctx.setLineWidth(5);
    ctx.strokePath();
    // Spitze (zeigt ungedreht nach oben = Norden)
    let head = new Path();
    head.addLines([rot(0, -21), rot(11, -4), rot(-11, -4)]);
    head.closeSubpath();
    ctx.addPath(head);
    ctx.setFillColor(WHITE);
    ctx.fillPath();
    return ctx.getImage();
}

function formatKm(km) {
    return km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#3C6E47"), new Color("#1E3A26")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

let SHOW_CHECKS = false;

function addRow(widget, peak) {
    let row = widget.addStack();
    // Antippen der Zeile öffnet den Komoot-Routenplaner am Gipfel (Universal Link – mit installierter App in Komoot,
    // sonst im Browser)
    row.url = `https://www.komoot.com/plan/@${peak.lat.toFixed(5)},${peak.lon.toFixed(5)},15z`;
    row.centerAlignContent();
    let arrow = row.addStack();
    arrow.size = new Size(14, 0);
    arrow.addImage(arrowImage(peak.bearing)).imageSize = new Size(SIZE.arrow, SIZE.arrow);
    row.addSpacer(4);
    // Spalte nach dem Pfeil: mit Strava der Haken (bis 50 m) bzw. klein dein geringster Abstand,
    // ohne Strava die Himmelsrichtung
    let info = row.addStack();
    info.size = new Size(40, 0);
    info.centerAlignContent();
    if (!SHOW_CHECKS) {
        // Breit genug für "WNW"/"WSW" (breite Buchstaben), notfalls minimal verkleinert statt "W…"
        addLabel(info, compass(peak.bearing), Font.semiboldSystemFont(SIZE.dir), WHITE, 0.75).minimumScaleFactor = 0.7;
    } else if (peak.visited) {
        addSymbol(info, "checkmark", SIZE.dir + 1, new Color("#7CE38B")).imageOpacity = 0.9;
    } else if (peak.approach !== undefined) {
        addLabel(info, formatApproach(peak.approach), Font.mediumSystemFont(Math.max(8, SIZE.dir - 1)), WHITE, 0.5).minimumScaleFactor = 0.8;
    }
    info.addSpacer();
    let name = addLabel(row, peak.name, Font.semiboldSystemFont(SIZE.name));
    // Lange Namen ("Immenstädter Horn") dürfen deutlicher schrumpfen statt abgeschnitten zu werden
    name.minimumScaleFactor = 0.65;
    row.addSpacer(6);
    row.addSpacer();
    let ele = row.addStack();
    ele.size = new Size(LARGE ? 88 : 78, 0);
    ele.centerAlignContent();
    ele.addSpacer();
    // Klein davor: Höhenunterschied zu dir ("+56", "−12")
    if (peak.above !== null && peak.above !== undefined) {
        addLabel(ele, `${peak.above >= 0 ? "+" : "−"}${Math.abs(peak.above)}`, Font.mediumMonospacedSystemFont(Math.max(8, SIZE.num - 3)), WHITE, 0.45);
        ele.addSpacer(3);
    }
    addLabel(ele, peak.ele ? `${peak.ele} m` : "–", Font.mediumMonospacedSystemFont(SIZE.num), ACCENT, peak.ele ? 1 : 0.5);
    let dist = row.addStack();
    dist.size = new Size(LARGE ? 52 : 46, 0);
    dist.addSpacer();
    addLabel(dist, formatKm(peak.km), Font.mediumMonospacedSystemFont(SIZE.num), WHITE, 0.85);
}

async function createWidget() {
    let widget = new ListWidget();
    widget.url = URLScheme.forRunningScript();
    background(widget);
    widget.setPadding(LARGE ? 12 : 10, 16, LARGE ? 6 : 8, 16);
    // Unterwegs öfter neu (Entfernungen ändern sich); iOS entscheidet selbst
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60000);

    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "mountain.2.fill", SIZE.header);
    header.addSpacer(6);
    addLabel(header, "Gipfel in der Nähe", Font.semiboldSystemFont(SIZE.header));
    header.addSpacer();

    let here = await currentLocation();
    if (!here) {
        widget.addSpacer(8);
        addLabel(widget, "Kein Standort – Ortungsdienste für Scriptable erlauben", Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 2;
        widget.addSpacer();
        return widget;
    }
    if (here.alt) addLabel(header, `du: ${Math.round(here.alt)} m`, Font.mediumSystemFont(LARGE ? 11 : 10), WHITE, 0.6);
    widget.addSpacer(SIZE.headerGap);

    let data;
    try {
        data = await loadPeaks(here);
    } catch (e) {
        addLabel(widget, `Gipfel nicht abrufbar (${e.message || e}) – antippen, um es in der App zu laden`, Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 3;
        widget.addSpacer();
        return widget;
    }
    let withGeo = p => ({ ...p, km: distanceKm(here, p), bearing: bearing(here, p), above: here.alt && p.ele ? Math.round(p.ele - here.alt) : null });
    // Nächste Gipfel, die wenigstens MIN_ABOVE m über dir liegen (reicht das nicht, auch niedrigere)
    let near = (data.peaks || []).filter(usable).map(withGeo).sort((a, b) => a.km - b.km);
    let high = near.filter(p => p.above === null || p.above >= MIN_ABOVE);
    let nearCount = COUNT - NOTABLE_COUNT;
    let nearest = high.slice(0, nearCount);
    if (nearest.length < nearCount) nearest = nearest.concat(near.filter(p => !nearest.includes(p)).slice(0, nearCount - nearest.length))
        .sort((a, b) => a.km - b.km);
    // Dazu die markantesten im Umkreis (bekannteste zuerst), die nicht schon oben stehen
    let key = p => peakKey(p);
    let shown = new Set(nearest.map(key));
    let notable = (data.notable || []).filter(usable).filter(p => !shown.has(key(p))).slice(0, NOTABLE_COUNT).map(withGeo)
        .sort((a, b) => a.km - b.km);
    let peaks = nearest.concat(notable);
    if (stravaConnected()) {
        SHOW_CHECKS = true;
        // Der Abgleich mit allen Routen ist für den Homescreen zu schwer (iOS verwirft dann still das Bild):
        // nur in der App rechnen – für alle gespeicherten Gipfel – und als kleine Liste merken
        if (!config.runsInWidget) saveApproach((data.peaks || []).concat(data.notable || []), await syncTracks());
        let approach = readApproach();
        peaks.forEach(p => {
            p.approach = approach[peakKey(p)];
            p.visited = p.approach !== undefined && p.approach <= TOLERANCE_M;
        });
    }
    if (!peaks.length) addLabel(widget, "Keine Gipfel im Umkreis von 40 km", Font.mediumSystemFont(12), WHITE, 0.8);
    peaks.forEach((p, i) => {
        if (i > 0) widget.addSpacer(SIZE.gap);
        // Abschnitt "markant im Umkreis" (groß mit Überschrift, mittel nur mit Trennlinie)
        if (i === nearest.length && notable.length) {
            widget.addSpacer(LARGE ? 4 : 1);
            if (LARGE) {
                addLabel(widget, "MARKANT IM UMKREIS", Font.semiboldSystemFont(9), WHITE, 0.5);
                widget.addSpacer(2);
            } else {
                let rule = widget.addStack();
                rule.size = new Size(0, 1);
                rule.backgroundColor = new Color("#FFFFFF", 0.2);
                rule.addSpacer();
                widget.addSpacer(2);
            }
        }
        addRow(widget, p);
    });
    widget.addSpacer();

    let note = [here.old ? "letzter Standort" : "", data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    // Mittel: keine Fußzeile (Platz für 8 Gipfel), Hinweise wie "offline" klein am Ende der Liste
    if (!SIZE.footer) {
        if (note) addLabel(widget, note, Font.mediumSystemFont(8), WHITE, 0.5);
        return widget;
    }
    let footer = widget.addStack();
    footer.addSpacer();
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    addLabel(footer, `${note ? note + " · " : ""}${data.source || "OpenStreetMap"} · Luftlinie · aktualisiert ${df.string(new Date())}`,
        Font.mediumSystemFont(8), WHITE, 0.5);
    return widget;
}

async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) Script.setWidget(widget);
    else if (FAMILY === "large") await widget.presentLarge();
    else await widget.presentMedium();
    Script.complete();
}

// Fehler sichtbar machen – sonst behält iOS still das letzte Bild
main().catch(e => {
    console.error(e);
    let widget = new ListWidget();
    background(widget);
    let t = widget.addText(`Gipfel: Fehler – ${e.message || e}`);
    t.font = Font.mediumSystemFont(11);
    t.textColor = WHITE;
    if (config.runsInWidget) Script.setWidget(widget);
    Script.complete();
});
