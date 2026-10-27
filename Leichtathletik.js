// Leichtathletik – die besten Leistungen der letzten Woche aus allen Disziplinen,
// nach World-Athletics-Punkten. Die Daten sammelt täglich ein GitHub-Workflow
// (scripts/leichtathletik_woche.mjs); das Widget lädt nur die fertige Datei.
// Großes Widget: Top 5 Frauen und Männer. Mittleres Widget: Top 3 nebeneinander.
//
// Region: weltweit (Standard) oder nur deutsche Athleten – im Loader per
// Function("REGION", code)("deutschland") oder als Widget-Parameter "deutschland".
// Ansicht "rekorde": die jüngsten Rekorde (WR, ER, DR) und neuen Einträge in den ewigen Top 10 von Welt,
// Europa und Deutschland – im Loader per Function("ANSICHT", code)("rekorde") oder Parameter "rekorde".
// Ansicht "kalender": die nächsten großen Wettkämpfe, Bahn und Straße nebeneinander (mittleres Widget).

const params = String(args.widgetParameter || "").trim().toLowerCase().split(/\s+/);
const GERMANY = String((typeof REGION !== "undefined" && REGION) || params.find(p => p === "deutschland") || "") === "deutschland";
const VIEW = String((typeof ANSICHT !== "undefined" && ANSICHT) || params.find(p => p === "rekorde" || p === "kalender") || "");
const RECORDS = VIEW === "rekorde";
const CALENDAR = VIEW === "kalender";
const FILE = RECORDS ? "leichtathletik_highlights" : CALENDAR ? "leichtathletik_kalender"
    : `leichtathletik_woche${GERMANY ? "_ger" : ""}`;
const DATA_URL = `https://raw.githubusercontent.com/Schubidu93/Scriptable/main/data/${FILE}.json`;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `${FILE}.json`);

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
        if (data && (data.women || data.men || data.items || data.track || data.road)) {
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

// "Takahata Race Walk Course, Takahata (JPN)" → "Takahata", "Chicago, IL (USA)" → "Chicago"
// Ort steht meist zuletzt; ein US-Bundesstaat-Kürzel am Ende wird übersprungen
function city(venue) {
    let parts = String(venue || "").replace(/\s*\(.*?\)\s*$/, "").split(",").map(p => p.trim()).filter(Boolean);
    while (parts.length > 1 && parts[parts.length - 1].length <= 3) parts.pop();
    return parts[parts.length - 1] || "";
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

// Auszeichnungen: Rekorde und Plätze in den ewigen Top 10
const BADGES = {
    WR: { text: "WR", color: new Color("#FFD66B"), dark: true },
    ER: { text: "ER", color: new Color("#2F6FEA") },
    DR: { text: "DR", color: new Color("#E0303A") },
    WT: { text: "Welt", color: new Color("#8E6CEF") },
    ET: { text: "EU", color: new Color("#3F7FB8") },
    DT: { text: "DE", color: new Color("#B4475A") },
};

function addBadge(stack, type, rank) {
    let badge = BADGES[type] || { text: type, color: new Color("#5F7D8C") };
    let pill = stack.addStack();
    pill.backgroundColor = badge.color;
    pill.cornerRadius = 4;
    pill.setPadding(1, 4, 1, 4);
    let text = rank > 1 ? `${badge.text} ${rank}` : badge.text;
    addLabel(pill, text, Font.boldSystemFont(9), badge.dark ? new Color("#3A2A00") : WHITE);
}

// "25 OCT 2026" → "25.10.26"
function fullDate(date) {
    let m = /(\d{4})/.exec(date || "");
    return m ? `${shortDate(date)}${m[1].slice(2)}` : shortDate(date);
}

// Zwei Zeilen: Auszeichnung(en), Name, Leistung – darunter Disziplin, Ort, Datum
function addHighlight(stack, item, compact) {
    let top = stack.addStack();
    top.centerAlignContent();
    let records = item.records && item.records.length ? item.records : [item.type];
    records.forEach((type, i) => {
        if (i > 0) top.addSpacer(3);
        addBadge(top, type, item.rank);
    });
    top.addSpacer(5);
    let f = flag(item.nat);
    addLabel(top, `${f ? f + " " : ""}${shortName(item.name)}`, Font.semiboldSystemFont(12), WHITE);
    top.addSpacer(4);
    top.addSpacer();
    addLabel(top, item.mark, Font.boldRoundedSystemFont(12), GOLD);

    let gender = item.gender === "women" ? "Frauen" : "Männer";
    let details = compact
        ? `${item.event} ${gender} · ${fullDate(item.date)}`
        : `${item.event} ${gender} · ${city(item.venue)} · ${fullDate(item.date)}`;
    addLabel(stack, details, Font.mediumSystemFont(9), WHITE, 0.65);
}

function buildRecords(widget, data, count, compact) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "trophy.fill", 13, GOLD);
    header.addSpacer(5);
    addLabel(header, "Rekorde & ewige Top 10", Font.semiboldSystemFont(14), WHITE);
    header.addSpacer();
    addLabel(header, `Welt · Europa · DE${data.stale ? " · offline" : ""}`, Font.semiboldSystemFont(10), WHITE, 0.6);
    widget.addSpacer(compact ? 5 : 6);

    let items = data.items || [];
    if (!items.length) {
        addLabel(widget, "Noch keine Einträge", Font.mediumSystemFont(12), WHITE, 0.7);
    }
    items.slice(0, count).forEach((item, i) => {
        if (i > 0) widget.addSpacer(compact ? 4 : 3);
        addHighlight(widget, item, compact);
    });
    widget.addSpacer();
}

// Kalender: Kategorie als Kürzel (Olympia/WM, Diamond League, Gold Label …)
function categoryBadge(event) {
    let group = event.group || "";
    if (event.category === "OW") return { text: /olymp/i.test(event.name + group) ? "OS" : "WM", color: new Color("#FFD66B"), dark: true };
    if (event.category === "DF") return { text: "DL Finale", color: new Color("#7B4BD8") };
    if (event.category === "GW") return { text: "DL", color: new Color("#7B4BD8") };
    if (event.category === "GL") return { text: "GL", color: new Color("#2F8FEA") };
    return { text: event.category, color: event.category === "A" ? new Color("#2DB37A") : new Color("#5F7D8C") };
}

// "2027-06-25" → Date (lokal, Mitternacht)
function dayOf(iso) {
    let [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function countdown(event) {
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let start = dayOf(event.startDate), end = dayOf(event.endDate || event.startDate);
    let days = Math.round((start - today) / 86400000);
    if (days === 0) return "heute";
    if (start < today && today <= end) return "läuft";
    if (days === 1) return "morgen";
    return `in ${days} T`;
}

// "25.06." bzw. "25.–27.06."
function dateRange(event) {
    let pad = n => String(n).padStart(2, "0");
    let s = dayOf(event.startDate), e = dayOf(event.endDate || event.startDate);
    if (s.getTime() === e.getTime()) return `${pad(s.getDate())}.${pad(s.getMonth() + 1)}.`;
    if (s.getMonth() === e.getMonth()) return `${pad(s.getDate())}.–${pad(e.getDate())}.${pad(e.getMonth() + 1)}.`;
    return `${pad(s.getDate())}.${pad(s.getMonth() + 1)}.–${pad(e.getDate())}.${pad(e.getMonth() + 1)}.`;
}

// Bahn-Meetings: Stadt aus dem Namen streichen, sie steht schon in der Zeile darunter
// ("ISTAF INDOOR Düsseldorf" → "ISTAF INDOOR"); bleibt nur ein Wort übrig ("Doha Meeting"), Name behalten
function eventName(event, track) {
    let place = city(event.venue);
    if (!track || !place) return event.name;
    let escaped = place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let short = event.name
        .replace(new RegExp(`(^|[\\s,\\-–])${escaped}(?=$|[\\s,\\-–])`, "gi"), " ")
        .replace(/\s+(de|di|of|in|du|von)\s*$/i, "")
        .replace(/[\s,\-–]+$/, "")
        .replace(/^[\s,\-–]+/, "")
        .replace(/\s+/g, " ");
    return short.split(" ").length >= 2 ? short : event.name;
}

function addEvent(stack, event, track) {
    let top = stack.addStack();
    top.centerAlignContent();
    let badge = categoryBadge(event);
    let pill = top.addStack();
    pill.backgroundColor = badge.color;
    pill.cornerRadius = 3;
    pill.setPadding(0, 3, 0, 3);
    addLabel(pill, badge.text, Font.boldSystemFont(9), badge.dark ? new Color("#3A2A00") : WHITE);
    top.addSpacer(4);
    addLabel(top, eventName(event, track), Font.semiboldSystemFont(12), WHITE);
    top.addSpacer();

    let nat = (/\(([A-Z]{3})\)\s*$/.exec(event.venue || "") || [])[1];
    let f = nat ? flag(nat) : "";
    // Läuft der Wettkampf gerade oder ist er heute, steht das statt des Datums
    let soon = countdown(event);
    let when = soon === "läuft" || soon === "heute" ? soon : dateRange(event);
    addLabel(stack, `${f ? f + " " : ""}${city(event.venue)} · ${when}`, Font.mediumSystemFont(10), WHITE, 0.65);
}

// Kopfzeile = Spaltentitel (Bahn | Straße), spart eine Zeile gegenüber Titel plus Spaltenköpfen
function buildCalendar(widget, data, count) {
    let columns = [["Bahn", "sportscourt", data.track], ["Straße", "road.lanes", data.road]];
    let row = widget.addStack();
    columns.forEach(([title, symbol, events], i) => {
        if (i > 0) row.addSpacer(12);
        let col = row.addStack();
        col.layoutVertically();
        let head = col.addStack();
        head.centerAlignContent();
        addSymbol(head, symbol, 12, WHITE);
        head.addSpacer(4);
        addLabel(head, title, Font.semiboldSystemFont(13), WHITE);
        if (i === 1 && data.stale) {
            head.addSpacer();
            addLabel(head, "offline", Font.semiboldSystemFont(9), WHITE, 0.6);
        }
        col.addSpacer(1);
        if (!events || !events.length) {
            col.addSpacer(2);
            addLabel(col, "Keine Termine", Font.mediumSystemFont(11), WHITE, 0.7);
        }
        (events || []).slice(0, count).forEach(event => {
            col.addSpacer(2);
            addEvent(col, event, i === 0);
        });
        col.addSpacer();
    });
    widget.addSpacer();
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
    if (CALENDAR) {
        let large = config.widgetFamily === "large" || config.widgetFamily === "extraLarge";
        widget.setPadding(12, 14, 4, 14);
        buildCalendar(widget, data, large ? 10 : 4);
    } else if (RECORDS) {
        widget.setPadding(12, 14, 4, 14);
        buildRecords(widget, data, config.widgetFamily === "medium" ? 3 : 10, config.widgetFamily === "medium");
    }
    else if (config.widgetFamily === "medium") buildMedium(widget, data);
    else buildLarge(widget, data);
    addUpdated(widget);
    return widget;
}

// Ohne Top-Level-await, damit das Skript auch per Function(code)() startet
async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else if (CALENDAR) {
        await widget.presentMedium();
    } else {
        await widget.presentLarge();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
