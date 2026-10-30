// Strava – Bilanz der letzten 12 Monate (rollierend, z. B. Nov. 2025 – Okt. 2026) für Laufen und Radfahren:
// Kilometer, Anzahl, Höhenmeter und Vergleich mit demselben Zeitraum ein Jahr früher.
// Die Daten kommen direkt von der Strava-API; Zugangsdaten liegen nur in der Scriptable-Keychain
// auf dem iPhone (nie auf GitHub).
//
// Einrichten: Skript in der Scriptable-App starten → „Strava verbinden“ (Client ID und Secret von
// strava.com/settings/api, Callback-Domain „localhost“).
// Optionale Ziele in km für 12 Monate – im Loader per Function("ZIELE", code)("lauf=1500 rad=5000")
// oder als Widget-Parameter "lauf=1500 rad=5000".
// Kleines Widget: beide Sportarten kompakt. Mittleres: zwei Spalten. Großes: zusätzlich Kilometer je Monat.

const KEY = {
    clientId: "strava_client_id",
    clientSecret: "strava_client_secret",
    refreshToken: "strava_refresh_token",
    accessToken: "strava_access_token",
    expiresAt: "strava_expires_at",
};
const API = "https://www.strava.com/api/v3/";
const REDIRECT = "http://localhost/strava";

const SPORTS = [
    { key: "run", title: "Laufen", unit: ["Lauf", "Läufe"], symbol: "figure.run", color: new Color("#FC4C02"),
        types: ["Run", "TrailRun", "VirtualRun"] },
    { key: "ride", title: "Radfahren", unit: ["Fahrt", "Fahrten"], symbol: "bicycle", color: new Color("#2F8FEA"),
        types: ["Ride", "GravelRide", "MountainBikeRide", "VirtualRide", "EBikeRide", "EMountainBikeRide", "Velomobile", "Handcycle"] },
];

const goalText = String((typeof ZIELE !== "undefined" && ZIELE) || args.widgetParameter || "").toLowerCase();
const GOALS = {
    run: Number((/lauf\w*\s*=\s*(\d+)/.exec(goalText) || [])[1]) || 0,
    ride: Number((/rad\w*\s*=\s*(\d+)/.exec(goalText) || [])[1]) || 0,
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "strava_stats.json");
const lastYearPath = fm.joinPath(fm.cacheDirectory(), "strava_lastyear.json");

const WHITE = Color.white();
const ORANGE = new Color("#FC4C02");

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

// ---------- Zugang ----------

function keychain(key) {
    return Keychain.contains(key) ? Keychain.get(key) : null;
}

function connected() {
    return Boolean(keychain(KEY.clientId) && keychain(KEY.clientSecret) && keychain(KEY.refreshToken));
}

async function tokenRequest(body) {
    let req = new Request("https://www.strava.com/oauth/token");
    req.method = "POST";
    req.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    req.body = Object.entries(body).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    let json = await req.loadJSON();
    if (!json.access_token) throw new Error(`Strava-Anmeldung fehlgeschlagen: ${JSON.stringify(json).slice(0, 200)}`);
    Keychain.set(KEY.accessToken, json.access_token);
    Keychain.set(KEY.refreshToken, json.refresh_token);
    Keychain.set(KEY.expiresAt, String(json.expires_at));
    return json.access_token;
}

// Zugriffsschlüssel gilt 6 Stunden – kurz vor Ablauf mit dem Refresh-Token erneuern
async function accessToken() {
    let token = keychain(KEY.accessToken);
    let expires = Number(keychain(KEY.expiresAt) || 0);
    if (token && expires * 1000 > Date.now() + 5 * 60 * 1000) return token;
    return tokenRequest({
        client_id: keychain(KEY.clientId),
        client_secret: keychain(KEY.clientSecret),
        grant_type: "refresh_token",
        refresh_token: keychain(KEY.refreshToken),
    });
}

async function ask(title, message, fields, ok = "Weiter") {
    let alert = new Alert();
    alert.title = title;
    alert.message = message;
    fields.forEach(([placeholder, value]) => alert.addTextField(placeholder, value || ""));
    alert.addAction(ok);
    alert.addCancelAction("Abbrechen");
    if ((await alert.present()) === -1) return null;
    return fields.map((_, i) => alert.textFieldValue(i).trim());
}

async function inform(title, message) {
    let alert = new Alert();
    alert.title = title;
    alert.message = message;
    alert.addAction("OK");
    await alert.present();
}

function codeFromUrl(url) {
    let m = /[?&]code=([^&#]+)/.exec(url || "");
    return m ? decodeURIComponent(m[1]) : null;
}

// Einmalige Einrichtung: Client ID/Secret speichern, Freigabe bei Strava, Code gegen Token tauschen
async function setup() {
    let values = await ask("Strava verbinden",
        "Client ID und Client Secret von strava.com/settings/api (Callback-Domain: localhost). "
        + "Sie werden nur in der Keychain dieses iPhones gespeichert.",
        [["Client ID", keychain(KEY.clientId)], ["Client Secret", keychain(KEY.clientSecret)]]);
    if (!values || !values[0] || !values[1]) return false;
    Keychain.set(KEY.clientId, values[0]);
    Keychain.set(KEY.clientSecret, values[1]);

    let authUrl = "https://www.strava.com/oauth/authorize?client_id=" + encodeURIComponent(values[0])
        + "&response_type=code&approval_prompt=auto&scope=read,activity:read_all"
        + "&redirect_uri=" + encodeURIComponent(REDIRECT);

    await inform("Bei Strava freigeben",
        "Gleich öffnet sich Strava. Anmelden und „Autorisieren“ tippen – danach das Fenster mit „Fertig“ schließen.");
    let code = null;
    let web = new WebView();
    web.shouldAllowRequest = req => {
        if (req.url.startsWith("http://localhost")) {
            code = codeFromUrl(req.url);
            return false;
        }
        return true;
    };
    await web.loadURL(authUrl);
    await web.present(true);

    // Klappt die Anmeldung im Scriptable-Browser nicht (z. B. Login mit Apple/Google): über Safari
    if (!code) {
        Pasteboard.copy(authUrl);
        let pasted = await ask("Freigabe über Safari",
            "Der Freigabe-Link ist kopiert. In Safari einfügen, „Autorisieren“ tippen – die folgende Seite lädt nicht, "
            + "das ist richtig. Ihre Adresse (beginnt mit http://localhost) kopieren und hier einfügen.",
            [["http://localhost/strava?…code=…", ""]], "Verbinden");
        code = pasted && codeFromUrl(pasted[0]);
    }
    if (!code) {
        await inform("Nicht verbunden", "Kein Freigabe-Code gefunden. Bitte erneut versuchen.");
        return false;
    }
    await tokenRequest({
        client_id: values[0],
        client_secret: values[1],
        grant_type: "authorization_code",
        code,
    });
    if (fm.fileExists(lastYearPath)) fm.remove(lastYearPath);
    await inform("Verbunden ✓", "Strava ist eingerichtet. Jetzt das Widget hinzufügen.");
    return true;
}

// ---------- Daten ----------

// Alle Aktivitäten im Zeitraum (Seiten zu 200)
async function loadActivities(token, from, to) {
    let all = [];
    for (let page = 1; page <= 15; page++) {
        let req = new Request(`${API}athlete/activities?after=${Math.floor(from / 1000)}&before=${Math.floor(to / 1000)}`
            + `&per_page=200&page=${page}`);
        req.headers = { Authorization: `Bearer ${token}` };
        let list = await req.loadJSON();
        if (!Array.isArray(list)) throw new Error(`Strava: ${JSON.stringify(list).slice(0, 200)}`);
        all = all.concat(list.map(a => ({
            type: a.sport_type || a.type,
            date: a.start_date_local,
            km: (a.distance || 0) / 1000,
            hm: a.total_elevation_gain || 0,
        })));
        if (list.length < 200) break;
    }
    return all;
}

// Rollierende 12 Monate: vom Ersten des Monats vor 11 Monaten bis heute (z. B. 1. Nov. 2025 – 30. Okt. 2026).
// Verglichen wird mit demselben Zeitraum ein Jahr früher (1. Nov. 2024 – 30. Okt. 2025).
function windowStart(now) {
    return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

// "2026-03-05T07:12:00Z" → Monatsindex im Fenster (0 = erster Monat), aus Datum ohne Zeitzone
function monthIndex(iso, start) {
    let [y, m] = iso.slice(0, 7).split("-").map(Number);
    return (y - start.getFullYear()) * 12 + (m - 1 - start.getMonth());
}

// "YYYY-MM-DD" in Ortszeit für Vergleiche mit start_date_local
function ymd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Summen je Sportart: gesamt und je Monat des Fensters
function summarize(activities, start) {
    let result = {};
    for (let sport of SPORTS) {
        let own = activities.filter(a => sport.types.includes(a.type));
        let months = Array(12).fill(0);
        own.forEach(a => {
            let i = monthIndex(a.date, start);
            if (i >= 0 && i < 12) months[i] += a.km;
        });
        result[sport.key] = {
            count: own.length,
            km: own.reduce((s, a) => s + a.km, 0),
            hm: own.reduce((s, a) => s + a.hm, 0),
            months,
        };
    }
    return result;
}

// Aktivitäten zwischen zwei Tagen (einschließlich), Strava-Abfrage mit einem Tag Zeitzonen-Puffer
async function activitiesBetween(token, from, to) {
    let list = await loadActivities(token, from.getTime() - 86400000, to.getTime() + 86400000);
    let a = ymd(from), b = ymd(to);
    return list.filter(x => x.date.slice(0, 10) >= a && x.date.slice(0, 10) <= b);
}

// Vorjahreszeitraum ändert sich kaum – einmal am Tag neu laden
async function previousWindow(token, start, now) {
    let key = ymd(now);
    if (fm.fileExists(lastYearPath)) {
        let cached = JSON.parse(fm.readString(lastYearPath));
        if (cached.key === key && cached.rolling) return cached.stats;
    }
    let prevStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
    let prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    let stats = summarize(await activitiesBetween(token, prevStart, prevEnd), prevStart);
    fm.writeString(lastYearPath, JSON.stringify({ key, rolling: true, stats }));
    return stats;
}

async function loadData() {
    try {
        let token = await accessToken();
        let now = new Date();
        let start = windowStart(now);
        let activities = await activitiesBetween(token, start, now);
        let previous = await previousWindow(token, start, now).catch(e => {
            console.log(`Vorjahreszeitraum: ${e}`);
            return null;
        });
        let data = { generated: now.toISOString(), start: start.toISOString(), current: summarize(activities, start), previous };
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`Strava: ${e}`);
        if (!fm.fileExists(cachePath)) throw e;
        let data = JSON.parse(fm.readString(cachePath));
        // Älterer Zwischenspeicher (Kalenderjahr) passt nicht zur neuen Darstellung
        if (!data.start) throw e;
        data.stale = true;
        UPDATED = new Date(data.generated).getTime();
        return data;
    }
}

// ---------- Anzeige ----------

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
    sym.applyFont(Font.boldSystemFont(size));
    let img = stack.addImage(sym.image);
    img.imageSize = new Size(size, size);
    img.tintColor = color;
    return img;
}

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#2B2F36"), new Color("#15171B")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// 1234.5 → "1.235"
function thousands(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function km(n) {
    return n >= 100 ? thousands(n) : n.toFixed(1).replace(".", ",");
}

// Fortschrittsbalken: Füllung = Anteil, Strich = Soll (Ziel anteilig zum Jahr bzw. Vorjahr zum Stichtag)
function progressBar(width, fill, mark, color) {
    let height = 6;
    let ctx = new DrawContext();
    ctx.size = new Size(width, height + 4);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    let track = new Path();
    track.addRoundedRect(new Rect(0, 2, width, height), 3, 3);
    ctx.addPath(track);
    ctx.setFillColor(new Color("#FFFFFF", 0.15));
    ctx.fillPath();
    let w = Math.max(0, Math.min(1, fill)) * width;
    if (w > 0) {
        let bar = new Path();
        bar.addRoundedRect(new Rect(0, 2, Math.max(w, 6), height), 3, 3);
        ctx.addPath(bar);
        ctx.setFillColor(color);
        ctx.fillPath();
    }
    if (mark != null && mark > 0 && mark <= 1) {
        ctx.setFillColor(WHITE);
        ctx.fillRect(new Rect(Math.min(mark * width, width - 2) - 1, 0, 2, height + 4));
    }
    return ctx.getImage();
}

// Zeitraum als Text: "Nov 25 – Okt 26"
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function periodText(data) {
    let start = new Date(data.start);
    let end = new Date(start.getFullYear(), start.getMonth() + 11, 1);
    let label = d => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return `${label(start)} – ${label(end)}`;
}

// Vergleichszeile und Balkenwerte: mit Ziel (km in 12 Monaten) gegen das Ziel, sonst gegen den Vorjahreszeitraum
// (Balken: Füllung = diese 12 Monate, Strich = Vorjahreszeitraum)
function comparison(sport, data) {
    let stats = data.current[sport.key];
    let goal = GOALS[sport.key];
    if (goal) {
        let diff = stats.km - goal;
        return {
            fill: stats.km / goal, mark: null,
            text: `Ziel ${thousands(goal)} km · ${diff >= 0 ? "+" : "−"}${thousands(Math.abs(diff))} km`,
            good: diff >= 0,
        };
    }
    let prev = data.previous && data.previous[sport.key];
    if (!prev || !prev.km) return { fill: stats.km ? 1 : 0, mark: null, text: "Vorjahr: keine Daten", good: true };
    let max = Math.max(stats.km, prev.km);
    let diff = stats.km - prev.km;
    return {
        fill: stats.km / max, mark: prev.km / max,
        text: `Vorjahr ${thousands(prev.km)} km · ${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff) / prev.km * 100)} %`,
        good: diff >= 0,
    };
}

function addSportColumn(stack, sport, data, width) {
    let stats = data.current[sport.key];
    let col = stack.addStack();
    col.layoutVertically();
    col.size = new Size(width, 0);

    let head = col.addStack();
    head.centerAlignContent();
    addSymbol(head, sport.symbol, 13, sport.color);
    head.addSpacer(5);
    addLabel(head, sport.title, Font.semiboldSystemFont(13), WHITE, 0.85);
    col.addSpacer(3);

    let big = col.addStack();
    big.bottomAlignContent();
    addLabel(big, km(stats.km), Font.boldRoundedSystemFont(26), WHITE);
    big.addSpacer(3);
    addLabel(big, "km", Font.semiboldRoundedSystemFont(13), WHITE, 0.6);
    col.addSpacer(2);

    let facts = col.addStack();
    facts.centerAlignContent();
    addLabel(facts, `${stats.count} ${sport.unit[stats.count === 1 ? 0 : 1]}`, Font.mediumSystemFont(11), WHITE, 0.8);
    facts.addSpacer(8);
    addSymbol(facts, "mountain.2.fill", 9, WHITE).imageOpacity = 0.6;
    facts.addSpacer(3);
    addLabel(facts, `${thousands(stats.hm)} hm`, Font.mediumSystemFont(11), WHITE, 0.8);
    col.addSpacer(6);

    let cmp = comparison(sport, data);
    let bar = col.addImage(progressBar(width, cmp.fill, cmp.mark, sport.color));
    bar.imageSize = new Size(width, 10);
    col.addSpacer(3);
    addLabel(col, cmp.text, Font.mediumSystemFont(9), cmp.good ? new Color("#34C759") : new Color("#FF9F0A"));
}

// Kleines Widget: je Sportart eine Zeile mit km, darunter Anzahl und Höhenmeter
function addSmallSport(stack, sport, data) {
    let stats = data.current[sport.key];
    let row = stack.addStack();
    row.centerAlignContent();
    addSymbol(row, sport.symbol, 14, sport.color);
    row.addSpacer(6);
    addLabel(row, km(stats.km), Font.boldRoundedSystemFont(22), WHITE);
    row.addSpacer(3);
    addLabel(row, "km", Font.semiboldRoundedSystemFont(11), WHITE, 0.6);
    row.addSpacer();
    stack.addSpacer(1);
    addLabel(stack, `${stats.count} ${sport.unit[stats.count === 1 ? 0 : 1]} · ${thousands(stats.hm)} hm`,
        Font.mediumSystemFont(10), WHITE, 0.75);
    stack.addSpacer(3);
    let cmp = comparison(sport, data);
    let bar = stack.addImage(progressBar(120, cmp.fill, cmp.mark, sport.color));
    bar.imageSize = new Size(120, 10);
}

// Großes Widget: Kilometer je Monat, Vorjahr als blasser Balken dahinter
function monthChart(data, sport, width, height) {
    let ctx = new DrawContext();
    ctx.size = new Size(width, height);
    ctx.opaque = false;
    ctx.respectScreenScale = true;
    let cur = data.current[sport.key].months;
    let prev = data.previous ? data.previous[sport.key].months : Array(12).fill(0);
    let max = Math.max(1, ...cur, ...prev);
    let labelHeight = 11;
    let chartHeight = height - labelHeight;
    let slot = width / 12;
    let barWidth = Math.min(10, slot * 0.55);
    let first = new Date(data.start).getMonth();
    Array.from({ length: 12 }, (_, i) => "JFMAMJJASOND"[(first + i) % 12]).forEach((letter, i) => {
        let x = i * slot + (slot - barWidth) / 2;
        let ph = (prev[i] / max) * chartHeight;
        if (ph > 0) {
            ctx.setFillColor(new Color("#FFFFFF", 0.15));
            let p = new Path();
            p.addRoundedRect(new Rect(x, chartHeight - ph, barWidth, ph), 2, 2);
            ctx.addPath(p);
            ctx.fillPath();
        }
        let ch = (cur[i] / max) * chartHeight;
        if (ch > 0) {
            ctx.setFillColor(sport.color);
            let c = new Path();
            c.addRoundedRect(new Rect(x + barWidth * 0.2, chartHeight - ch, barWidth * 0.6, ch), 2, 2);
            ctx.addPath(c);
            ctx.fillPath();
        }
        ctx.setFont(Font.mediumSystemFont(8));
        ctx.setTextColor(new Color("#FFFFFF", i === 11 ? 0.9 : 0.45));
        ctx.setTextAlignedCenter();
        ctx.drawTextInRect(letter, new Rect(i * slot, chartHeight + 1, slot, labelHeight));
    });
    return ctx.getImage();
}

function addHeader(widget, data) {
    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, "STRAVA", Font.heavySystemFont(12), ORANGE);
    header.addSpacer(6);
    addLabel(header, data ? "12 Monate" : "", Font.semiboldSystemFont(12), WHITE, 0.85);
    header.addSpacer();
    if (data) addLabel(header, `${periodText(data)}${data.stale ? " · offline" : ""}`,
        Font.semiboldSystemFont(10), WHITE, 0.55);
}

function buildSmall(widget, data) {
    addHeader(widget, data);
    widget.addSpacer(6);
    SPORTS.forEach((sport, i) => {
        if (i > 0) widget.addSpacer(8);
        addSmallSport(widget, sport, data);
    });
    widget.addSpacer();
}

function buildMedium(widget, data, large) {
    addHeader(widget, data);
    widget.addSpacer(large ? 10 : 6);
    let row = widget.addStack();
    SPORTS.forEach((sport, i) => {
        if (i > 0) row.addSpacer();
        addSportColumn(row, sport, data, 140);
    });
    if (large) {
        for (let sport of SPORTS) {
            widget.addSpacer(12);
            let title = widget.addStack();
            title.centerAlignContent();
            addSymbol(title, sport.symbol, 10, sport.color);
            title.addSpacer(4);
            addLabel(title, `${sport.title} je Monat`, Font.semiboldSystemFont(10), WHITE, 0.7);
            title.addSpacer();
            addLabel(title, "Vorjahr blass", Font.mediumSystemFont(9), WHITE, 0.45);
            widget.addSpacer(3);
            let chart = widget.addImage(monthChart(data, sport, 300, 58));
            chart.imageSize = new Size(300, 58);
        }
    }
    widget.addSpacer();
}

async function createWidget(family = config.widgetFamily) {
    let widget = new ListWidget();
    widget.url = "strava://";
    widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);
    background(widget);
    widget.setPadding(12, 14, 4, 14);

    if (!connected()) {
        addHeader(widget, null);
        widget.addSpacer(8);
        addLabel(widget, "Noch nicht verbunden – Skript in Scriptable öffnen und „Strava verbinden“ wählen.",
            Font.mediumSystemFont(12), WHITE, 0.8).lineLimit = 3;
        widget.addSpacer();
        return widget;
    }
    let data;
    try {
        data = await loadData();
    } catch (e) {
        addHeader(widget, null);
        widget.addSpacer(8);
        addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(12), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    if (family === "small") buildSmall(widget, data);
    else buildMedium(widget, data, family === "large" || family === "extraLarge");
    addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    if (!config.runsInWidget) {
        let alert = new Alert();
        alert.title = "Strava";
        alert.message = connected() ? "Verbunden." : "Noch nicht mit Strava verbunden.";
        alert.addAction("Vorschau mittel");
        alert.addAction("Vorschau groß");
        alert.addAction(connected() ? "Neu verbinden" : "Strava verbinden");
        alert.addCancelAction("Abbrechen");
        let choice = await alert.present();
        if (choice === 2) await setup();
        if (choice === 0 || choice === 1) {
            let widget = await createWidget(choice === 0 ? "medium" : "large");
            if (choice === 0) await widget.presentMedium();
            else await widget.presentLarge();
        }
        Script.complete();
        return;
    }
    Script.setWidget(await createWidget());
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
