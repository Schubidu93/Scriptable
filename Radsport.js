// Radsport – die letzten 3 WorldTour-Ergebnisse mit Top 3 und die nächsten 3 Rennen.
// Rundfahrten erscheinen als zwei Einträge: letzte Etappe und – wenn beendet – Gesamtwertung.
// Quelle: ProCyclingStats (procyclingstats.com). Großes Widget, im Stil der iOS-Widgets.
// Ein Tipp auf ein Rennen öffnet dessen Ergebnisse bei ProCyclingStats.
//
// Männer (Standard) oder Frauen: im Loader per Function("GESCHLECHT", code)("frauen")
// oder als Widget-Parameter "frauen".

const PCS = "https://www.procyclingstats.com/";
const WOMEN = String(
    (typeof GESCHLECHT !== "undefined" && GESCHLECHT) || args.widgetParameter || ""
).trim().toLowerCase() === "frauen";
const CONFIG = {
    circuit: WOMEN ? 24 : 1, // 1 = UCI WorldTour, 24 = UCI Women's WorldTour
    title: WOMEN ? "Women's WorldTour" : "WorldTour",
    past: 3,
    upcoming: 3,
    podium: 3,
};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `radsport-pcs${WOMEN ? "-frauen" : ""}.json`);

// Was beim Abruf passiert ist – wird angezeigt, wenn keine Daten kommen
const DIAG = [];

function pageTitle(html) {
    let m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || "");
    return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 40) : "ohne Titel";
}

// Cloudflare-Prüfseite statt Inhalt?
// (Normale Seiten binden auch Cloudflare-Skripte ein – daher nur am Titel erkennen)
function isChallenge(html) {
    return /Just a moment|Attention Required|Checking your browser/i.test(pageTitle(html));
}

function sleep(ms) {
    return new Promise(resolve => Timer.schedule(ms, false, resolve));
}

// Fallback: Seite in einem unsichtbaren Browser laden, bis die Cloudflare-Prüfung durch ist
async function loadInWebView(url) {
    let wv = new WebView();
    await wv.loadURL(url);
    let html = "";
    for (let i = 0; i < 12; i++) {
        html = await wv.evaluateJavaScript("document.documentElement.outerHTML");
        if (!isChallenge(html) && /<table/i.test(html)) break;
        await sleep(1000);
    }
    return html;
}

async function load(path) {
    let url = PCS + path;
    let req = new Request(url);
    req.headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    };
    let html = "";
    try {
        html = await req.loadString();
    } catch (e) {
        DIAG.push(`${path.split("?")[0]}: ${e}`);
    }
    let status = req.response ? req.response.statusCode : "?";
    if (status === 200 && !isChallenge(html)) return html;

    DIAG.push(`${path.split("?")[0]}: HTTP ${status} · ${pageTitle(html)}`);
    try {
        let viaBrowser = await loadInWebView(url);
        DIAG.push(`Browser: ${isChallenge(viaBrowser) ? "Prüfung nicht bestanden" : "ok"} · ${pageTitle(viaBrowser)}`);
        return viaBrowser;
    } catch (e) {
        DIAG.push(`Browser: ${e}`);
        return html;
    }
}

// PCS kennzeichnet Länder mit <span class="flag ke"> (ISO-Code) → "🇰🇪"
function flagEmoji(html) {
    let m = /class="[^"]*\bflag\s+([a-z]{2})\b/i.exec(html || "");
    if (!m) return "";
    let iso = m[1].toUpperCase() === "UK" ? "GB" : m[1].toUpperCase();
    return String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function withFlag(flag, text) {
    return flag ? `${flag} ${text}` : text;
}

function cleanText(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/\s+/g, " ")
        .trim();
}

// Kalender einer Saison: Rennen mit Link, Datum, Kategorie und ob schon ein Sieger feststeht
function parseCalendar(html, year) {
    let rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    return rows.map(row => {
        // Link direkt übernehmen – PCS nutzt "race/tour-down-under-2026-gc",
        // ältere Seiten "race/tour-down-under/2026/gc"; relativ oder absolut
        let link = /href=["'][^"']*?\b(race\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
        if (!link) return null;
        let text = cleanText(row);
        let dates = [...text.matchAll(/\b(\d{1,2})\.(\d{1,2})\b/g)].map(m => new Date(year, m[2] - 1, m[1]));
        if (!dates.length) {
            dates = [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map(m => new Date(m[1], m[2] - 1, m[3]));
        }
        if (!dates.length) return null;
        let cls = (/\b([12]\.[A-Za-z0-9.]+)/.exec(cleanText(row)) || [])[1] || "";
        return {
            name: cleanText(link[2]).replace(/\s*[-–]\s*(Men|Women|ME|WE)$|\s+(ME|WE)$|\s+Women's World ?Tour$/i, ""),
            flag: flagEmoji(row.slice(0, link.index)),
            path: link[1].replace(/\/$/, ""),
            start: dates[0],
            end: dates[1] || dates[0],
            stageRace: cls.startsWith("2."),
            finished: /href=["'][^"']*?\brider\//i.test(row),
        };
    }).filter(Boolean);
}

// Der Kalender verlinkt bereits auf die Ergebnisseite (bei Rundfahrten die Gesamtwertung)
function resultPath(race) {
    let path = race.path;
    if (/-(gc|result)$|\/(gc|result)$/.test(path)) return path;
    if (/\/\d{4}$/.test(path)) return `${path}/${race.stageRace ? "gc" : "result"}`;
    return path;
}

// "<span class="uppercase">Pogačar</span> Tadej" → "T. Pogačar"
function shortRider(html) {
    let surname = /<span[^>]*uppercase[^>]*>([\s\S]*?)<\/span>/i.exec(html);
    let full = cleanText(html);
    if (surname) {
        let last = cleanText(surname[1]);
        let first = cleanText(full.replace(last, ""));
        last = last === last.toUpperCase()
            ? last.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
            : last;
        return first ? `${first.charAt(0)}. ${last}` : last;
    }
    let words = full.split(" ");
    let caps = words.filter(w => w.length > 1 && w === w.toUpperCase());
    let rest = words.filter(w => !caps.includes(w));
    if (caps.length && rest.length) {
        let last = caps.map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
        return `${rest[0].charAt(0)}. ${last}`;
    }
    return full;
}

// Top 3 einer Ergebnistabelle: nur Zeilen mit Platzierung, beginnend bei 1.
// Fahrer-Links bevorzugt, bei Mannschaftszeitfahren Teams.
function parseRankedRows(table) {
    let rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(row => {
        let firstCell = /<td[^>]*>([\s\S]*?)<\/td>/i.exec(row);
        let rank = firstCell ? cleanText(firstCell[1]) : "";
        if (!/^\d+$/.test(rank)) return null;
        let rider = /<a[^>]*href=["'][^"']*?\brider\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
        let team = /<a[^>]*href=["'][^"']*?\bteam\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
        if (rider) {
            return {
                rank: Number(rank),
                rider: shortRider(rider[1]),
                flag: flagEmoji(row.slice(0, rider.index + rider[0].length)),
                team: team ? cleanText(team[1]) : "",
            };
        }
        if (team) {
            return { rank: Number(rank), rider: cleanText(team[1]), flag: flagEmoji(row.slice(0, team.index)), team: "" };
        }
        return null;
    }).filter(Boolean);
    if (!rows.length || rows[0].rank !== 1) return [];
    return rows.slice(0, CONFIG.podium).map(({ rank, ...rest }) => rest);
}

// Alle Tabellen der Seite durchsuchen – sichtbare Reiter zuerst, versteckte danach
function parsePodium(html) {
    let tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)];
    let hidden = match => {
        let before = html.slice(Math.max(0, match.index - 4000), match.index);
        let tabs = [...before.matchAll(/<div[^>]*class=["']([^"']*\bresTab\b[^"']*)["']/gi)];
        return tabs.length > 0 && /\bhide\b/.test(tabs[tabs.length - 1][1]);
    };
    let ordered = tables.filter(t => !hidden(t)).concat(tables.filter(hidden));
    for (let t of ordered) {
        let rows = parseRankedRows(t[0]);
        if (rows.length) return rows;
    }
    let empty = [];
    let riderLinks = (html.match(/href=["'][^"']*?\brider\//gi) || []).length;
    empty.debug = `${pageTitle(html)} · ${tables.length} Tabellen · ${riderLinks} Fahrer`;
    return empty;
}

// Tabelle eines bestimmten Reiters (z. B. "STAGE" oder "GC") lesen.
// PCS: <ul class="tabs … resultTabs"><li><a data-id="123">GC</a></li> … <div class="resTab" data-id="123">
function parseTab(html, tabName) {
    for (let m of html.matchAll(/<a[^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        if (cleanText(m[2]).toUpperCase() !== tabName) continue;
        let id = m[1];
        let idAttr = new RegExp(`data-id=["']${id.replace(/[^\w-]/g, "")}["']`);
        let divs = [...html.matchAll(/<div[^>]*>/gi)].filter(d => /resTab/.test(d[0]) && idAttr.test(d[0]));
        for (let d of divs) {
            let table = /<table[^>]*>[\s\S]*?<\/table>/i.exec(html.slice(d.index));
            let rows = table ? parseRankedRows(table[0]) : [];
            if (rows.length) return rows;
        }
    }
    return null; // Reiter nicht gefunden
}

// Etappennummer aus Titel oder Überschrift: "… Stage 21 results" / "Prologue"
function parseStageNumber(html) {
    let title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || ["", ""])[1];
    let text = title + " " + cleanText((/<h1[\s\S]*?<\/h1>/i.exec(html) || [""])[0])
        + " " + cleanText((/<h2[\s\S]*?<\/h2>/i.exec(html) || [""])[0]);
    if (/prolog/i.test(text)) return 0;
    let m = /Stage\s+(\d+)/i.exec(text);
    return m ? Number(m[1]) : null;
}

// "Date: 26 July 2026" auf Ergebnisseiten
function parseDate(html) {
    let months = ["january", "february", "march", "april", "may", "june", "july",
        "august", "september", "october", "november", "december"];
    let m = /Date:?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(cleanText(html));
    if (!m) return null;
    let month = months.indexOf(m[2].toLowerCase());
    return month >= 0 ? new Date(Number(m[3]), month, Number(m[1])) : null;
}

async function loadCalendar(year) {
    let html = await load(`races.php?year=${year}&circuit=${CONFIG.circuit}&filter=Filter`);
    let races = parseCalendar(html, year);
    if (!races.length) {
        let rows = (html.match(/<tr/gi) || []).length;
        DIAG.push(`Kalender ${year}: ${rows} Zeilen, 0 Rennen erkannt · ${pageTitle(html)}`);
        // Beispielzeile für die Fehlersuche: Text und erste Links
        let sample = (html.match(/<tr[\s\S]*?<\/tr>/gi) || []).find(r => /<a\s/i.test(r));
        if (sample) {
            let hrefs = [...sample.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 2).join(" | ");
            DIAG.push(`Zeile: ${cleanText(sample).slice(0, 70)}`);
            DIAG.push(`Links: ${hrefs.slice(0, 120)}`);
        }
    }
    return races;
}

async function loadData() {
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let year = today.getFullYear();

    let races = await loadCalendar(year);
    let finished = races.filter(r => r.finished);
    let upcoming = races.filter(r => !r.finished && r.end >= today);

    // Saisonwechsel: Vorjahr bzw. nächstes Jahr ergänzen
    if (finished.length < CONFIG.past) {
        finished = (await loadCalendar(year - 1).catch(() => [])).filter(r => r.finished).concat(finished);
    }
    if (upcoming.length < CONFIG.upcoming) {
        upcoming = upcoming.concat(await loadCalendar(year + 1).catch(() => []));
    }

    finished.sort((a, b) => b.end - a.end);
    upcoming.sort((a, b) => a.start - b.start);

    // Laufende Rundfahrten zuerst, dann die beendeten Rennen – bis 3 Ergebnisse beisammen sind
    let running = upcoming.filter(r => r.stageRace && r.start <= today);
    let entries = [];
    for (let race of running.concat(finished)) {
        let need = CONFIG.past - entries.length;
        if (need <= 0) break;
        try {
            if (race.stageRace) {
                entries = entries.concat(await loadStageEntries(race, today, need));
            } else {
                let podium = parsePodium(await load(resultPath(race)));
                entries.push({ ...race, label: "", date: race.end, path: resultPath(race), podium, debug: podium.debug });
            }
        } catch (e) {
            console.log(`${race.name}: Ergebnis nicht geladen: ${e}`);
            entries.push({ ...race, label: "", date: race.end, path: resultPath(race), podium: [], debug: String(e) });
        }
    }

    return {
        past: entries.slice(0, CONFIG.past),
        upcoming: upcoming.filter(r => !running.includes(r)).slice(0, CONFIG.upcoming),
        stale: false,
    };
}

// Rundfahrt in zwei Einträge aufteilen: letzte Etappe und – wenn beendet – Gesamtwertung.
// Die verlinkte Seite enthält beide als Reiter "STAGE" und "GC".
async function loadStageEntries(race, today, need) {
    let path = resultPath(race);
    let html = await load(path);
    let isRunning = !race.finished;

    let stagePodium = parseTab(html, "STAGE");
    let gcPodium = parseTab(html, "GC");
    if (stagePodium === null && gcPodium === null) {
        // Keine Reiter (z. B. alte Seitenstruktur): sichtbare Tabelle als Gesamtwertung
        gcPodium = parsePodium(html);
    }

    let number = parseStageNumber(html);
    let stageLabel = number === 0 ? "Prolog" : number ? `Etappe ${number}` : "Letzte Etappe";
    let date = parseDate(html) || (isRunning ? today : race.end);

    let entries = [];
    if (!isRunning && gcPodium && gcPodium.length) {
        entries.push({ ...race, label: "Gesamtwertung", date: race.end, path, podium: gcPodium, isGC: true });
    }
    if (stagePodium && stagePodium.length) {
        entries.push({ ...race, label: stageLabel, date, path, podium: stagePodium, running: isRunning });
    }
    if (!entries.length) {
        let debug = (gcPodium && gcPodium.debug) || `${pageTitle(html)} · keine Etappen-/GC-Tabelle`;
        entries.push({ ...race, label: "", date: race.end, path, podium: [], debug });
    }
    return entries.slice(0, need);
}

function serialize(data) {
    return JSON.stringify(data);
}

function deserialize(json) {
    let data = JSON.parse(json);
    let revive = r => ({ ...r, start: new Date(r.start), end: new Date(r.end), date: r.date ? new Date(r.date) : undefined });
    data.past = data.past.map(revive);
    data.upcoming = data.upcoming.map(revive);
    return data;
}

// Bei Fehlern den letzten Stand anzeigen
async function loadWithCache() {
    try {
        let data = await loadData();
        if (data.past.length || data.upcoming.length) {
            fm.writeString(cachePath, serialize(data));
            return data;
        }
    } catch (e) {
        console.log(`Abruf fehlgeschlagen: ${e}`);
        DIAG.push(`Fehler: ${e}`);
    }
    DIAG.forEach(line => console.log(line));
    if (fm.fileExists(cachePath)) {
        let data = deserialize(fm.readString(cachePath));
        data.stale = true;
        return data;
    }
    return null;
}

function formatDate(date) {
    let pad = n => String(n).padStart(2, "0");
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;
}

function formatRange(race) {
    return race.end - race.start > 0
        ? `${formatDate(race.start)}–${formatDate(race.end)}`
        : formatDate(race.start);
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

const WHITE = Color.white();
const LIVE = new Color("#FF453A");
const MEDALS = [new Color("#F5C542"), new Color("#C9D1D9"), new Color("#D08A4E")];

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#34495E"), new Color("#1C2833")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

function addHeader(widget, data) {
    let header = widget.addStack();
    header.centerAlignContent();
    addSymbol(header, "bicycle", 15, WHITE);
    header.addSpacer(5);
    addLabel(header, CONFIG.title, Font.semiboldSystemFont(15), WHITE);
    header.addSpacer();
    let offline = data && data.stale ? " · offline" : "";
    addLabel(header, `ProCyclingStats${offline}`, Font.semiboldSystemFont(11), WHITE, 0.6);
}

function addSectionTitle(stack, text) {
    addLabel(stack, text.toUpperCase(), Font.semiboldSystemFont(11), WHITE, 0.6);
}

function addPastRace(stack, race, podiumSize) {
    let block = stack.addStack();
    block.layoutVertically();
    block.url = PCS + (race.path || resultPath(race));

    let title = block.addStack();
    title.centerAlignContent();
    addLabel(title, withFlag(race.flag, race.name), Font.semiboldSystemFont(13), WHITE);
    if (race.label) {
        title.addSpacer(5);
        addLabel(title, race.label, Font.semiboldSystemFont(11), WHITE, 0.65);
    }
    title.addSpacer(6);
    title.addSpacer();
    if (race.running) {
        addSymbol(title, "dot.radiowaves.left.and.right", 10, LIVE);
        title.addSpacer(3);
        addLabel(title, "läuft", Font.semiboldSystemFont(10), LIVE);
    } else {
        let date = race.isGC || !race.label ? formatRange(race) : formatDate(race.date || race.end);
        addLabel(title, date, Font.mediumSystemFont(10), WHITE, 0.6);
    }

    if (!race.podium.length) {
        let t = addLabel(block, `Ergebnis nicht verfügbar${race.debug ? " · " + race.debug : ""}`, Font.mediumSystemFont(10), WHITE, 0.6);
        t.lineLimit = 2;
        return;
    }
    race.podium.slice(0, podiumSize).forEach((p, i) => {
        block.addSpacer(3);
        let row = block.addStack();
        row.centerAlignContent();
        addSymbol(row, `${i + 1}.circle.fill`, 12, MEDALS[i]);
        row.addSpacer(5);
        addLabel(row, withFlag(p.flag, p.rider), Font.mediumSystemFont(12), WHITE);
        row.addSpacer(6);
        row.addSpacer();
        addLabel(row, p.team, Font.regularSystemFont(10), WHITE, 0.55);
    });
}

function addUpcomingRace(stack, race, today) {
    let row = stack.addStack();
    row.centerAlignContent();
    row.url = PCS + resultPath(race);
    let running = race.start <= today;
    addSymbol(row, running ? "dot.radiowaves.left.and.right" : "calendar", 11, WHITE);
    row.addSpacer(5);
    addLabel(row, withFlag(race.flag, race.name), Font.mediumSystemFont(12), WHITE);
    row.addSpacer(6);
    row.addSpacer();
    addLabel(row, running ? "läuft" : formatRange(race), Font.mediumSystemFont(10), WHITE, running ? 1 : 0.6);
}

function buildLarge(widget, data) {
    let today = new Date();
    today.setHours(0, 0, 0, 0);

    addHeader(widget, data);
    widget.addSpacer(6);

    if (!data) {
        addLabel(widget, "Keine Daten – später erneut versuchen", Font.mediumSystemFont(13), WHITE, 0.8);
        widget.addSpacer(8);
        DIAG.slice(0, 8).forEach(line => {
            let t = addLabel(widget, line, Font.regularMonospacedSystemFont(10), WHITE, 0.6);
            t.lineLimit = 2;
        });
        widget.addSpacer();
        return;
    }

    data.past.forEach((race, i) => {
        if (i > 0) widget.addSpacer(10);
        addPastRace(widget, race, CONFIG.podium);
    });

    widget.addSpacer();
    addSectionTitle(widget, "Nächste Rennen");
    data.upcoming.forEach(race => {
        widget.addSpacer(5);
        addUpcomingRace(widget, race, today);
    });
}

// Mittel: links die Sieger der letzten Rennen, rechts die nächsten Rennen
function buildMedium(widget, data) {
    let today = new Date();
    today.setHours(0, 0, 0, 0);

    addHeader(widget, data);
    widget.addSpacer(8);
    if (!data) {
        addLabel(widget, "Keine Daten", Font.mediumSystemFont(13), WHITE, 0.8);
        return;
    }

    let row = widget.addStack();
    let left = row.addStack();
    left.layoutVertically();
    left.size = new Size(150, 0);
    addSectionTitle(left, "Sieger");
    data.past.forEach(race => {
        left.addSpacer(4);
        let block = left.addStack();
        block.layoutVertically();
        block.url = PCS + (race.path || resultPath(race));
        addLabel(block, withFlag(race.flag, race.label ? `${race.name} · ${race.label}` : race.name), Font.semiboldSystemFont(12), WHITE);
        let winner = block.addStack();
        winner.centerAlignContent();
        addSymbol(winner, "trophy.fill", 10, MEDALS[0]);
        winner.addSpacer(4);
        addLabel(winner, race.podium[0] ? withFlag(race.podium[0].flag, race.podium[0].rider) : "–", Font.regularSystemFont(11), WHITE, 0.8);
    });
    left.addSpacer();

    row.addSpacer();

    let right = row.addStack();
    right.layoutVertically();
    right.size = new Size(130, 0);
    addSectionTitle(right, "Als Nächstes");
    data.upcoming.forEach(race => {
        right.addSpacer(4);
        let block = right.addStack();
        block.layoutVertically();
        block.url = PCS + resultPath(race);
        addLabel(block, withFlag(race.flag, race.name), Font.semiboldSystemFont(12), WHITE);
        let running = race.start <= today;
        addLabel(block, running ? "läuft" : formatRange(race), Font.regularSystemFont(11), WHITE, 0.6);
    });
    right.addSpacer();
}

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    widget.url = `${PCS}races.php?year=${new Date().getFullYear()}&circuit=${CONFIG.circuit}&filter=Filter`;
    widget.refreshAfterDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(14, 16, 14, 16);

    if (config.widgetFamily === "medium") {
        buildMedium(widget, data);
    } else {
        buildLarge(widget, data);
    }
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
