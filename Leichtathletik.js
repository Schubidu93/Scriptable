// Leichtathletik – die besten Leistungen der letzten Woche aus allen Disziplinen,
// nach World-Athletics-Punkten. Die Daten sammelt täglich ein GitHub-Workflow
// (scripts/leichtathletik_woche.mjs); das Widget lädt nur die fertige Datei.
// Großes Widget: Top 5 Frauen und Männer. Mittleres Widget: Top 3 nebeneinander.
//
// Region: weltweit (Standard) oder nur deutsche Athleten – im Loader per
// Function("REGION", code)("deutschland") oder als Widget-Parameter "deutschland".
// Ansicht "rekorde": die jüngsten Rekorde (WR, ER, DR) und neuen Einträge in den ewigen Top 10 von Welt,
// Europa und Deutschland – im Loader per Function("ANSICHT", code)("rekorde") oder Parameter "rekorde".
// Ansicht "kalender": die nächsten großen Wettkämpfe, Bahn und Straße nebeneinander (großes Widget, auch mittel).

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
    ALG: "DZ", HKG: "HK", ARG: "AR", AUS: "AU", AUT: "AT", BAH: "BS", BDI: "BI", BEL: "BE", BHR: "BH", BRN: "BH",
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
    // Mehrere Namen möglich ("a|b"): der erste, den iOS kennt
    let sym = name.split("|").map(n => SFSymbol.named(n)).find(Boolean) || SFSymbol.named("circle");
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
    addLabel(pill, text, Font.boldSystemFont(9), badge.dark ? new Color("#3A2A00") : WHITE).minimumScaleFactor = 1;
}

// "25 OCT 2026" → "25.10.26"
function fullDate(date) {
    let m = /(\d{4})/.exec(date || "");
    return m ? `${shortDate(date)}${m[1].slice(2)}` : shortDate(date);
}

// Mehrere Auszeichnungen (z. B. EU 8 und DE 2); ältere Daten: nur Rekorde bzw. Hauptauszeichnung
function badgesOf(item) {
    let badges = item.badges && item.badges.length ? item.badges
        : (item.records && item.records.length ? item.records : [item.type]).map(type => ({ type, rank: item.rank }));
    return badges.slice(0, 3);
}

// Höhe eines Eintrags: immer zwei Textzeilen (Abzeichen stehen nebeneinander)
function highlightHeight() {
    return 26;
}

// Einheitliche Zeilen: links Name und darunter Disziplin, Ort, Datum – rechts die Abzeichen
// nebeneinander (rechtsbündig, gleiche Größe), ganz rechts die Leistung
function addHighlight(stack, item, compact) {
    let row = stack.addStack();
    row.topAlignContent();

    let left = row.addStack();
    left.layoutVertically();
    let f = flag(item.nat);
    addLabel(left, `${f ? f + " " : ""}${shortName(item.name)}`, Font.semiboldSystemFont(12), WHITE);
    let gender = item.gender === "women" ? "Frauen" : "Männer";
    let details = compact
        ? `${item.event} ${gender} · ${fullDate(item.date)}`
        : `${item.event} ${gender} · ${city(item.venue)} · ${fullDate(item.date)}`;
    addLabel(left, details, Font.mediumSystemFont(9), WHITE, 0.65);

    row.addSpacer(6);
    row.addSpacer();

    let tags = row.addStack();
    tags.centerAlignContent();
    badgesOf(item).forEach((badge, i) => {
        if (i > 0) tags.addSpacer(3);
        addBadge(tags, badge.type, badge.rank);
    });

    row.addSpacer(8);
    let mark = row.addStack();
    mark.size = new Size(compact ? 50 : 56, 0);
    mark.addSpacer();
    addLabel(mark, item.mark, Font.boldRoundedSystemFont(compact ? 12 : 13), GOLD);
}

function buildRecords(widget, data, large) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "trophy.fill", 13, GOLD);
    header.addSpacer(5);
    addLabel(header, "Rekorde & ewige Top 10", Font.semiboldSystemFont(14), WHITE);
    header.addSpacer();
    addLabel(header, `Welt · Europa · DE${data.stale ? " · offline" : ""}`, Font.semiboldSystemFont(10), WHITE, 0.6);
    widget.addSpacer(large ? 8 : 5);

    let items = data.items || [];
    if (!items.length) {
        addLabel(widget, "Noch keine Einträge", Font.mediumSystemFont(12), WHITE, 0.7);
    }
    // So viele Einträge, wie in die Höhe passen (mehrere Abzeichen brauchen mehr Platz)
    let budget = large ? 330 : 100, gap = large ? 7 : 4, used = 0, shown = [];
    for (let item of items.slice(0, 10)) {
        let h = highlightHeight(item) + (shown.length ? gap : 0);
        if (used + h > budget) break;
        used += h;
        shown.push(item);
    }
    shown.forEach((item, i) => {
        if (i > 0) widget.addSpacer(gap);
        addHighlight(widget, item, !large);
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

// Lange Namen kürzen: Sponsoren und Zusätze weg, „Championships“ → „Champs“ …
// ("TCS New York City Marathon" → "New York City Marathon")
const SPONSOR_PREFIX = /^(TCS|BYD|Wanda|ORLEN|Mapei|Santos|Bank of China|Generali|Schneider Electric|BMW|Haspa|Mainova)\s+/i;
function displayName(event, track) {
    let name = eventName(event, track)
        .replace(/\s+presented by\b.*$/i, "")
        .replace(/\s+(Trinidad Alfonso( Zurich)?|Trophée EDF|Zurich)$/i, "");
    while (SPONSOR_PREFIX.test(name) && name.replace(SPONSOR_PREFIX, "").split(" ").length >= 2) {
        name = name.replace(SPONSOR_PREFIX, "");
    }
    return name
        .replace(/\bChampionships\b/g, "Champs")
        .replace(/\bInternational\b/g, "Int.")
        .replace(/\s+/g, " ")
        .trim();
}

// Wie im iOS-Kalender: links das Datum als Block (Tag groß, Monat klein), rechts Name und darunter
// Kürzel, Flagge und Ort. Mehrtägige Wettkämpfe: „bis 10.01.“ in der Ortszeile.
const MONTHS_DE = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];

// Zentriert in fester Breite – ohne Abstandhalter, die selbst Platz kosten (sonst „…“ statt „27“)
function addCentered(stack, text, font, color, opacity = 1) {
    let line = stack.addStack();
    line.size = new Size(28, 0);
    line.centerAlignContent();
    let t = addLabel(line, text, font, color, opacity);
    t.centerAlignText();
    t.minimumScaleFactor = 1;
}

function addEvent(stack, event, track) {
    let row = stack.addStack();
    row.topAlignContent();
    let start = dayOf(event.startDate), end = dayOf(event.endDate || event.startDate);
    let soon = countdown(event);
    let live = soon === "läuft" || soon === "heute";

    let date = row.addStack();
    date.layoutVertically();
    date.size = new Size(28, 0);
    addCentered(date, String(start.getDate()), Font.boldRoundedSystemFont(16), live ? GOLD : WHITE);
    addCentered(date, MONTHS_DE[start.getMonth()], Font.semiboldSystemFont(8), GOLD, 0.9);

    row.addSpacer(7);
    let right = row.addStack();
    right.layoutVertically();
    // Gleiche Schrift wie die Athletennamen in den Straßenlauf-Widgets
    let name = addLabel(right, displayName(event, track), Font.semiboldSystemFont(11), WHITE);
    name.lineLimit = 2;
    name.minimumScaleFactor = 1;
    right.addSpacer(2);

    let info = right.addStack();
    info.centerAlignContent();
    let badge = categoryBadge(event);
    let pill = info.addStack();
    pill.backgroundColor = badge.color;
    pill.cornerRadius = 3;
    pill.setPadding(0, 3, 0, 3);
    addLabel(pill, badge.text, Font.boldSystemFont(8), badge.dark ? new Color("#3A2A00") : WHITE);
    info.addSpacer(4);
    let nat = (/\(([A-Z]{3})\)\s*$/.exec(event.venue || "") || [])[1];
    let f = nat ? flag(nat) : "";
    let pad = n => String(n).padStart(2, "0");
    let extra = live ? soon : end.getTime() !== start.getTime() ? `bis ${pad(end.getDate())}.${pad(end.getMonth() + 1)}.` : "";
    addLabel(info, `${f ? f + " " : ""}${city(event.venue)}${extra ? " · " + extra : ""}`, Font.mediumSystemFont(10), WHITE, 0.65);
}

// Geschätzte Zeilen des Namens (ca. 18 Zeichen je Zeile neben dem Kürzel, Umbruch an Wortgrenzen)
function nameLines(event, track) {
    let lines = 1, width = 0;
    for (let word of displayName(event, track).split(" ")) {
        if (width && width + 1 + word.length > 18) {
            lines++;
            width = word.length;
        } else {
            width += (width ? 1 : 0) + word.length;
        }
    }
    return Math.min(2, lines);
}

// So viele Termine, wie in die Höhe passen – lange Namen brauchen zwei, drei Zeilen
function fitEvents(events, track, large) {
    let budget = large ? 335 : 115, gap = large ? 8 : 5, used = 0, list = [];
    for (let event of events || []) {
        let height = nameLines(event, track) * 13.5 + 15 + (list.length ? gap : 0);
        if (used + height > budget) break;
        used += height;
        list.push(event);
    }
    return list;
}

// Kopfzeile = Spaltentitel (Bahn | Straße), spart eine Zeile gegenüber Titel plus Spaltenköpfen
function buildCalendar(widget, data, large) {
    let columns = [["Bahn", "figure.track.and.field|oval", data.track], ["Straße", "figure.run|road.lanes", data.road]];
    let row = widget.addStack();
    columns.forEach(([title, symbol, events], i) => {
        if (i > 0) row.addSpacer(12);
        let col = row.addStack();
        col.layoutVertically();
        col.size = new Size(150, 0);
        let head = col.addStack();
        head.centerAlignContent();
        addSymbol(head, symbol, 13, GOLD);
        head.addSpacer(5);
        addLabel(head, title.toUpperCase(), Font.boldSystemFont(12), WHITE, 0.9);
        if (i === 1 && data.stale) {
            head.addSpacer();
            addLabel(head, "offline", Font.semiboldSystemFont(9), WHITE, 0.6);
        }
        col.addSpacer(3);
        if (!events || !events.length) {
            col.addSpacer(2);
            addLabel(col, "Keine Termine", Font.mediumSystemFont(11), WHITE, 0.7);
        }
        fitEvents(events, i === 0, large).forEach((event, j) => {
            col.addSpacer(j === 0 ? 4 : large ? 8 : 5);
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
    // Antippen startet das Skript in Scriptable (frische Daten) statt eine Website zu öffnen
    widget.url = URLScheme.forRunningScript();
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
        // In der App (ohne Widget-Größe) groß – das ist die Standardgröße des Kalenders
        let large = !config.widgetFamily || config.widgetFamily === "large" || config.widgetFamily === "extraLarge";
        widget.setPadding(12, 14, 4, 14);
        buildCalendar(widget, data, large);
    } else if (RECORDS) {
        widget.setPadding(12, 14, 4, 14);
        buildRecords(widget, data, config.widgetFamily !== "medium");
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
    } else {
        await widget.presentLarge();
    }
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
