// Gipfel – die fünf nächsten Berggipfel vom aktuellen Standort aus (OpenStreetMap, natural=peak mit Namen):
// Name, Höhe, Entfernung (Luftlinie) und Richtung als Himmelsrichtung (z. B. SSW) mit Pfeil.
// Die Gipfel kommen über die Overpass-API; neu gefragt wird erst, wenn du dich mehr als 1 km bewegt hast
// (sonst nur Entfernung und Richtung neu berechnet). Mittleres Widget: 5 Gipfel, großes: 10.

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const RADII = [15000, 40000]; // erst 15 km, reicht das nicht für genug Gipfel, 40 km
const FAMILY = config.widgetFamily || "medium";
const COUNT = FAMILY === "large" || FAMILY === "extraLarge" ? 10 : 5;

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
    if (cached && cached.peaks && distanceKm(here, cached.center) < 1 && Date.now() - cached.time < 7 * 86400000) return cached;
    try {
        let peaks = [];
        // Im Widget nur eine Abfrage (großer Umkreis), in der App erst klein, dann groß
        for (let radius of config.runsInWidget ? RADII.slice(-1) : RADII) {
            peaks = (await overpass(here, radius)).map(e => ({
                name: e.tags["name:de"] || e.tags.name,
                ele: elevation(e.tags.ele),
                lat: e.lat,
                lon: e.lon,
            }));
            if (peaks.length >= COUNT * 2) break;
        }
        let data = { center: { lat: here.lat, lon: here.lon }, time: Date.now(), peaks };
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Overpass: ${e}`);
        if (cached) return { ...cached, stale: true };
        throw e;
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
    let sym = SFSymbol.named(name) || SFSymbol.named("mountain.2.fill");
    sym.applyFont(Font.systemFont(size));
    let img = stack.addImage(sym.image);
    let natural = sym.image.size;
    img.imageSize = new Size(natural.height ? size * natural.width / natural.height : size, size);
    img.tintColor = color;
    return img;
}

// Pfeil in Richtung des Gipfels (Norden oben), als Bild gezeichnet
function arrowImage(deg) {
    let size = 44;
    let ctx = new DrawContext();
    ctx.size = new Size(size, size);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    let c = size / 2;
    let rot = (x, y) => {
        let a = rad(deg);
        return new Point(c + x * Math.cos(a) - y * Math.sin(a), c + x * Math.sin(a) + y * Math.cos(a));
    };
    // Spitze nach oben (y negativ), dann gedreht
    let path = new Path();
    path.addLines([rot(0, -18), rot(11, 14), rot(0, 7), rot(-11, 14)]);
    path.closeSubpath();
    ctx.addPath(path);
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

function addRow(widget, peak) {
    let row = widget.addStack();
    row.centerAlignContent();
    let img = row.addImage(arrowImage(peak.bearing));
    img.imageSize = new Size(13, 13);
    row.addSpacer(4);
    let dir = row.addStack();
    dir.size = new Size(30, 0);
    addLabel(dir, compass(peak.bearing), Font.semiboldSystemFont(11), WHITE, 0.75);
    dir.addSpacer();
    let name = addLabel(row, peak.name, Font.semiboldSystemFont(13));
    name.minimumScaleFactor = 0.8;
    row.addSpacer(6);
    row.addSpacer();
    let ele = row.addStack();
    ele.size = new Size(58, 0);
    ele.addSpacer();
    addLabel(ele, peak.ele ? `${peak.ele} m` : "–", Font.mediumMonospacedSystemFont(12), ACCENT, peak.ele ? 1 : 0.5);
    let dist = row.addStack();
    dist.size = new Size(52, 0);
    dist.addSpacer();
    addLabel(dist, formatKm(peak.km), Font.mediumMonospacedSystemFont(12), WHITE, 0.85);
}

async function createWidget() {
    let widget = new ListWidget();
    widget.url = URLScheme.forRunningScript();
    background(widget);
    widget.setPadding(12, 16, 6, 16);
    // Unterwegs öfter neu (Entfernungen ändern sich); iOS entscheidet selbst
    widget.refreshAfterDate = new Date(Date.now() + 15 * 60000);

    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "mountain.2.fill", 15);
    header.addSpacer(6);
    addLabel(header, "Gipfel in der Nähe", Font.semiboldSystemFont(15));
    header.addSpacer();

    let here = await currentLocation();
    if (!here) {
        widget.addSpacer(8);
        addLabel(widget, "Kein Standort – Ortungsdienste für Scriptable erlauben", Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 2;
        widget.addSpacer();
        return widget;
    }
    if (here.alt) addLabel(header, `du: ${Math.round(here.alt)} m`, Font.mediumSystemFont(11), WHITE, 0.6);
    widget.addSpacer(large() ? 10 : 6);

    let data;
    try {
        data = await loadPeaks(here);
    } catch (e) {
        addLabel(widget, `Gipfel nicht abrufbar (${e.message || e}) – antippen, um es in der App zu laden`, Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 3;
        widget.addSpacer();
        return widget;
    }
    let peaks = data.peaks.map(p => ({ ...p, km: distanceKm(here, p), bearing: bearing(here, p) }))
        .sort((a, b) => a.km - b.km).slice(0, COUNT);
    if (!peaks.length) addLabel(widget, "Keine Gipfel im Umkreis von 40 km", Font.mediumSystemFont(12), WHITE, 0.8);
    peaks.forEach((p, i) => {
        if (i > 0) widget.addSpacer(large() ? 8 : 4);
        addRow(widget, p);
    });
    widget.addSpacer();

    let footer = widget.addStack();
    footer.addSpacer();
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    let note = [here.old ? "letzter Standort" : "", data.stale ? "offline" : ""].filter(Boolean).join(" · ");
    addLabel(footer, `${note ? note + " · " : ""}Luftlinie · aktualisiert ${df.string(new Date())}`, Font.mediumSystemFont(8), WHITE, 0.5);
    return widget;
}

function large() {
    return COUNT > 5;
}

async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) Script.setWidget(widget);
    else if (FAMILY === "large") await widget.presentLarge();
    else await widget.presentMedium();
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
