// Radsport – die drei neuesten Ergebnisse (WorldTour-Kalender und Straßen-WM) mit Top 3 und die nächsten 3 Rennen.
// Gesamtwertung und Etappen zählen einzeln: nach einer Rundfahrt z. B. GC, letzte und vorletzte Etappe;
// während einer Rundfahrt ihre letzten Etappen. Am selben Tag gilt: GC vor Etappe, Rundfahrt vor Eintagesrennen.
// Quelle: ProCyclingStats (procyclingstats.com). Großes Widget, im Stil der iOS-Widgets.
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
// Ergebnisse beendeter Rennen ändern sich nicht – einmal gefunden, dauerhaft gespeichert
const resultsPath = fm.joinPath(fm.documentsDirectory(), `radsport-ergebnisse${WOMEN ? "-frauen" : ""}.json`);

// Zeitbudget: Widgets werden von iOS nach rund 30 s abgebrochen („Received timeout“).
// Teure Wege (Browser, weitere Seiten) nur, solange genug Zeit bleibt; in der App großzügiger.
const STARTED = Date.now();
const BUDGET = config.runsInWidget ? 22000 : 90000;
function timeLeft() {
    return BUDGET - (Date.now() - STARTED);
}

function loadSavedResults() {
    try {
        return fm.fileExists(resultsPath) ? JSON.parse(fm.readString(resultsPath)) : {};
    } catch (e) {
        return {};
    }
}

function saveResults(saved) {
    // Nur die jüngsten 40 Rennen behalten
    let keys = Object.keys(saved).sort((a, b) => (saved[b].savedAt || 0) - (saved[a].savedAt || 0)).slice(0, 40);
    let slim = {};
    keys.forEach(k => { slim[k] = saved[k]; });
    fm.writeString(resultsPath, JSON.stringify(slim));
}

// Was beim Abruf passiert ist – wird angezeigt, wenn keine Daten kommen
const DIAG = [];

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
// (optional mit eigener Bedingung, wann die Seite fertig ist)
async function loadInWebView(url, ready = html => !isChallenge(html) && /<table/i.test(html)) {
    let wv = new WebView();
    await wv.loadURL(url);
    let html = "";
    for (let i = 0; i < 12 && (i === 0 || timeLeft() > 3000); i++) {
        html = await wv.evaluateJavaScript("document.documentElement.outerHTML");
        if (ready(html)) break;
        await sleep(1000);
    }
    return html;
}

// Ergebnisseite laden. Fehlt die Ergebnisliste im HTML (wird bei manchen Seiten
// erst per JavaScript nachgeladen), die Seite im unsichtbaren Browser öffnen.
async function loadResultPage(path, hasResults) {
    let html = await load(path);
    if (hasResults(html) || timeLeft() < 12000) return html;
    try {
        let rendered = await loadInWebView(PCS + path, hasResults);
        if (hasResults(rendered)) return rendered;
        html = html.replace(/<title[^>]*>/i, "$&[Browser] ");
    } catch (e) {
        console.log(`Browser für ${path}: ${e}`);
    }
    return html;
}

function hasPodium(html) {
    return parsePodium(html).length > 0;
}

function hasStageOrGC(html) {
    return (parseTab(html, "STAGE") || []).length > 0 || (parseTab(html, "GC") || []).length > 0 || hasPodium(html);
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

// Deutsche Fahrerinnen und Fahrer gold hinterlegt (wie das Lieblingsteam im Fußball-Widget);
// Innenabstand immer, damit hinterlegte und normale Zeilen bündig bleiben
function highlightGerman(row, rider) {
    row.setPadding(0, 2, 0, 2);
    if (rider && rider.flag === "🇩🇪") {
        row.backgroundColor = new Color("#FFE08A", 0.35);
        row.cornerRadius = 4;
    }
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
        // Abgesagte Rennen stehen durchgestrichen im Kalender – überspringen
        if (/line-through|strike|striked|cancel|<s[\s>]|<del[\s>]/i.test(row)) return null;
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
    let rows = (html.match(/<tr/gi) || []).length;
    empty.debug = `${pageTitle(html)} · ${tables.length} Tabellen · ${rows} Zeilen · ${riderLinks} Fahrer`;
    return empty;
}

// Tabelle unter der Überschrift „General classification“ (PCS: …/stage-3-gc). Eindeutig die GC –
// auch wenn ihr Podium dem der letzten Etappe gleicht.
function parseGCTable(html) {
    for (let t of (html || "").matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)) {
        let before = html.slice(Math.max(0, t.index - 1500), t.index);
        // Überschrift muss direkt vor dieser Tabelle stehen, nicht vor einer früheren
        let since = before.slice(before.toLowerCase().lastIndexOf("</table>") + 1);
        if (!/general classification/i.test(cleanText(since))) continue;
        let tabs = [...before.matchAll(/<div[^>]*class=["']([^"']*\bresTab\b[^"']*)["']/gi)];
        if (tabs.length && /\bhide\b/.test(tabs[tabs.length - 1][1])) continue;
        let rows = parseRankedRows(t[0]);
        if (rows.length) return rows;
    }
    return null;
}

// Reiter (z. B. "STAGE" oder "GC") finden und seine Tabelle lesen.
// PCS: <ul class="tabs … resultTabs"><li><a data-id="123">GC</a></li> … <div class="resTab" data-id="123">
// Versteckte Reiter werden oft erst beim Anklicken gefüllt – daher nur innerhalb des eigenen
// Bereichs suchen (bis zum nächsten Reiter), nie in der Tabelle eines anderen Reiters.
function findTab(html, tabName) {
    for (let m of html.matchAll(/<a[^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        if (cleanText(m[2]).toUpperCase() !== tabName) continue;
        let id = m[1].replace(/[^\w-]/g, "");
        let href = /href=["']([^"'#][^"']*)["']/i.exec(m[0].slice(0, m[0].indexOf(">") + 1));
        let idAttr = new RegExp(`data-id=["']${id}["']`);
        let starts = [...html.matchAll(/<div[^>]*>/gi)].filter(d => /resTab/.test(d[0]));
        let rows = [];
        starts.forEach((d, i) => {
            if (rows.length || !idAttr.test(d[0])) return;
            let end = i + 1 < starts.length ? starts[i + 1].index : html.length;
            let table = /<table[^>]*>[\s\S]*?<\/table>/i.exec(html.slice(d.index, end));
            if (table) rows = parseRankedRows(table[0]);
        });
        let path = href && /race\//.test(href[1]) ? href[1].replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "") : null;
        return { rows, path };
    }
    return null; // Reiter nicht gefunden
}

function parseTab(html, tabName) {
    let tab = findTab(html, tabName);
    return tab ? tab.rows : null;
}

// Gleiche Fahrer in gleicher Reihenfolge? PCS zeigt Etappe und Gesamtwertung teils im selben
// Bereich – solange der GC-Reiter nicht geladen ist, steht dort die Etappe.
function samePodium(a, b) {
    return Boolean(a && b && a.length && a.length === b.length && a.every((r, i) => r.rider === b[i].rider));
}

// Brauchbare Gesamtwertung: gefüllt und nicht bloß die Etappenwertung
function isGC(rows, stage) {
    return Boolean(rows && rows.length && !samePodium(rows, stage));
}

// Sichtbare Ergebnistabellen der Seite im Browser (nur Tabellen mit Fahrer-Links)
const VISIBLE_TABLES_JS = `(function () {
    return JSON.stringify(Array.prototype.slice.call(document.querySelectorAll("table"))
        .filter(function (t) { return t.offsetParent !== null && t.querySelector('a[href*="rider/"]'); })
        .map(function (t) { return t.outerHTML; }));
})()`;

async function visiblePodium(wv) {
    let tables = JSON.parse(await wv.evaluateJavaScript(VISIBLE_TABLES_JS) || "[]");
    for (let table of tables) {
        let rows = parseRankedRows(table);
        if (rows.length) return rows;
    }
    return [];
}

// Seite im unsichtbaren Browser öffnen, sichtbare Tabelle merken (Etappe), dann den Reiter
// „GC“ antippen – egal ob Link, Listeneintrag oder Knopf mit Trikot-Symbol – und warten,
// bis eine andere Tabelle sichtbar ist. Ergebnis: { stage, gc }
async function loadGCInBrowser(path, stage) {
    let wv = new WebView();
    await wv.loadURL(PCS + path);
    let before = [];
    for (let i = 0; i < 8 && !before.length && timeLeft() > 2000; i++) {
        before = await visiblePodium(wv);
        if (!before.length) await sleep(1000);
    }
    stage = stage && stage.length ? stage : before;
    // Kandidaten mit Text „GC“; Reiter neben „STAGE“ (die Reiterleiste) zuerst
    let count = await wv.evaluateJavaScript(`(function () {
        var all = Array.prototype.slice.call(document.querySelectorAll("a, li, button, span, div"));
        var hits = all.filter(function (e) {
            return e.textContent.trim().toUpperCase() === "GC"
                && !Array.prototype.some.call(e.children, function (c) { return c.textContent.trim().toUpperCase() === "GC"; });
        });
        var nearStage = function (e) {
            var box = e.closest("ul, nav") || (e.parentElement && e.parentElement.parentElement);
            return box && /STAGE/i.test(box.textContent) ? 0 : 1;
        };
        hits.sort(function (a, b) { return nearStage(a) - nearStage(b); });
        window.__gcHits = hits.slice(0, 3);
        return window.__gcHits.length;
    })()`);
    for (let n = 0; n < count; n++) {
        await wv.evaluateJavaScript(`(function () {
            var hit = window.__gcHits && window.__gcHits[${n}];
            if (!hit) return false;
            (hit.closest("a, li, button") || hit).click();
            return true;
        })()`);
        for (let i = 0; i < 8 && timeLeft() > 2000; i++) {
            await sleep(1000);
            let rows = await visiblePodium(wv);
            if (isGC(rows, stage)) return { stage, gc: rows };
            let html = await wv.evaluateJavaScript("document.documentElement.outerHTML");
            let tab = parseTab(html, "GC");
            if (isGC(tab, stage)) return { stage, gc: tab };
        }
    }
    return { stage, gc: [] };
}

// ---------- Gesamtwertung aus Wikipedia ----------
// Schnell und zuverlässig erreichbar; die Rennberichte führen Tabellen „General classification
// after Stage N“ bzw. „Final general classification“ (Vorlage {{cyclingresult}} oder Tabelle mit {{flagathlete}}).
const WIKI = "https://en.wikipedia.org/w/api.php?format=json&";
const IOC_ISO = {
    AUS: "AU", AUT: "AT", BEL: "BE", BLR: "BY", BRA: "BR", CAN: "CA", CHN: "CN", COL: "CO", CRO: "HR", CZE: "CZ",
    DEN: "DK", ECU: "EC", ERI: "ER", ESP: "ES", EST: "EE", ETH: "ET", FRA: "FR", GBR: "GB", GER: "DE", HUN: "HU",
    IRL: "IE", ISR: "IL", ITA: "IT", JPN: "JP", KAZ: "KZ", LAT: "LV", LTU: "LT", LUX: "LU", MEX: "MX", NED: "NL",
    NOR: "NO", NZL: "NZ", POL: "PL", POR: "PT", RSA: "ZA", RUS: "RU", RWA: "RW", SLO: "SI", SVK: "SK", SUI: "CH",
    SWE: "SE", UKR: "UA", URU: "UY", USA: "US", VEN: "VE", ARG: "AR", ALG: "DZ", KEN: "KE", UGA: "UG",
};

function iocFlag(code) {
    let iso = IOC_ISO[String(code || "").toUpperCase()];
    return iso ? String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";
}

async function wikiJSON(params) {
    let req = new Request(WIKI + params);
    req.timeoutInterval = 8;
    req.headers = { "User-Agent": "Scriptable-Radsport-Widget/1.0" };
    return req.loadJSON();
}

async function wikiText(title) {
    let json = await wikiJSON(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`);
    return json.parse ? json.parse.wikitext["*"] : "";
}

// "[[João Almeida (cyclist)|João Almeida]]" → "J. Almeida"
function wikiRider(cell) {
    let link = /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(cell);
    let full = (link ? link[1] : cell).replace(/\(.*?\)/g, "").replace(/\{\{[^}]*\}\}/g, "").trim();
    let parts = full.split(/\s+/);
    return parts.length > 1 ? `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}` : full;
}

// Alle Ergebnistabellen ({{cyclingresult}}) eines Artikels mit Titel bzw. Abschnittsüberschrift
function parseWikiBlocks(text) {
    let blocks = [];
    for (let m of text.matchAll(/\{\{\s*cyclingresult start([^}]*)\}\}([\s\S]*?)\{\{\s*cyclingresult end/gi)) {
        let title = (/title\s*=\s*([^|}<]*)/i.exec(m[1]) || [])[1] || "";
        if (!title) {
            let heading = [...text.slice(Math.max(0, m.index - 300), m.index).matchAll(/=+\s*([^=\n]+?)\s*=+/g)].pop();
            title = heading ? heading[1] : "";
        }
        let rows = [...m[2].matchAll(/\{\{\s*cyclingresult\s*\|\s*(\d+)\s*\|((?:\[\[[^\]]*\]\]|[^|\[}])+)\|\s*([A-Z]{3})/gi)]
            .map(r => ({ rank: Number(r[1]), rider: wikiRider(r[2]), flag: iocFlag(r[3]), team: "" }));
        blocks.push({ title, rows });
    }
    return blocks;
}

function podiumOf(rows) {
    return rows.length >= 3 && rows[0].rank === 1 ? rows.slice(0, CONFIG.podium).map(({ rank, ...rest }) => rest) : null;
}

// Alle GC-Tabellen eines Artikels; die beste ist die Schlusswertung („Final …“ oder höchste Etappe)
function parseWikiGC(text) {
    let score = title => /final/i.test(title) ? 1000 : (Number((/stage\s+(\d+)/i.exec(title) || [])[1]) || 999);
    let blocks = parseWikiBlocks(text).filter(b => /general classification/i.test(b.title))
        .map(b => ({ score: score(b.title), rows: b.rows }));
    // Tabelle mit Überschrift „Final general classification“ und {{flagathlete|[[Name]]|NAT}}
    for (let m of text.matchAll(/\|\+([^\n]*general classification[^\n]*)\n([\s\S]*?)\n\|\}/gi)) {
        let rows = [...m[2].matchAll(/\{\{\s*flagathlete\s*\|((?:\[\[[^\]]*\]\]|[^|\[}])+)\|\s*([A-Z]{3})/gi)]
            .map((r, i) => ({ rank: i + 1, rider: wikiRider(r[1]), flag: iocFlag(r[2]), team: "" }));
        blocks.push({ score: score(m[1]), rows });
    }
    let best = blocks.filter(b => podiumOf(b.rows)).sort((a, b) => b.score - a.score)[0];
    return best ? podiumOf(best.rows) : null;
}

// Tagesergebnis einer Etappe („Stage 6 result“), nicht die Wertungen danach
function parseWikiStage(text, n) {
    let stage = new RegExp(`\\bstage\\s*${n}\\b`, "i");
    let block = parseWikiBlocks(text).find(b => stage.test(b.title) && !/classification/i.test(b.title) && podiumOf(b.rows));
    return block ? podiumOf(block.rows) : null;
}

// Artikel suchen ("2026 La Vuelta Ciclista a España" → "2026 Vuelta a España") – Hauptartikel und Etappenseiten
const WIKI_TITLES = {};
async function wikiTitles(race) {
    if (WIKI_TITLES[race.path]) return WIKI_TITLES[race.path];
    let year = (race.end || race.start || new Date()).getFullYear();
    // PCS-Namen auf die Wikipedia-Schreibweise bringen: "La Vuelta Ciclista a España" → "Vuelta a España"
    let name = race.name.replace(/^(La|Le|Il)\s+(?=Vuelta|Tour)/i, "").replace(/\bCiclista\s+/i, "");
    let female = /women|femmes|donne|ladies|femenina|feminin/i;
    let query = `${year} ${name}${WOMEN && !female.test(name) ? " Women" : ""} stage`;
    let search = await wikiJSON(`action=query&list=search&srlimit=10&srsearch=${encodeURIComponent(query)}`);
    let titles = ((search.query && search.query.search) || []).map(x => x.title)
        .filter(t => t.startsWith(String(year)) && !/^\d{4} .*teams? and cyclists/i.test(t))
        .filter(t => WOMEN ? female.test(t) : !female.test(t));
    let main = titles.filter(t => !/stage/i.test(t)).slice(0, 1);
    let stagePages = titles.filter(t => /stage/i.test(t))
        .sort((a, b) => (Number((/(\d+)\D*$/.exec(b) || [])[1]) || 0) - (Number((/(\d+)\D*$/.exec(a) || [])[1]) || 0));
    return (WIKI_TITLES[race.path] = { main, stagePages });
}

const WIKI_TEXTS = {};
async function wikiTextCached(title) {
    if (!(title in WIKI_TEXTS)) WIKI_TEXTS[title] = await wikiText(title);
    return WIKI_TEXTS[title];
}

async function wikiGC(race) {
    let { main, stagePages } = await wikiTitles(race);
    for (let title of main.concat(stagePages).slice(0, 3)) {
        if (timeLeft() < 3000) break;
        let rows = parseWikiGC(await wikiTextCached(title));
        if (rows) return rows;
    }
    return null;
}

async function wikiStage(race, n) {
    let { main, stagePages } = await wikiTitles(race);
    // Eigene Etappenseite („… Stage 6“) zuerst, sonst der Hauptartikel
    let own = stagePages.filter(t => new RegExp(`stage\\s*${n}\\D*$`, "i").test(t));
    for (let title of own.concat(main)) {
        if (timeLeft() < 3000) break;
        let text = await wikiTextCached(title);
        let rows = own.includes(title)
            ? (parseWikiStage(text, n) || podiumOf(parseWikiBlocks(text).find(b => !/classification/i.test(b.title))?.rows || []))
            : parseWikiStage(text, n);
        if (rows) return rows;
    }
    return null;
}

// Teams zu Fahrern aus der PCS-Ergebnistabelle ergänzen (dort stehen alle Fahrer mit Team)
function withTeams(rows, html) {
    let trs = (html || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
    return rows.map(r => {
        if (r.team) return r;
        let last = r.rider.replace(/^[A-ZÀ-Ž]\.\s*/u, "").toLowerCase();
        let initial = r.rider.charAt(0).toLowerCase();
        for (let tr of trs) {
            let rider = /<a[^>]*href=["'][^"']*?\brider\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(tr);
            if (!rider) continue;
            let short = shortRider(rider[1]).toLowerCase();
            if (short.endsWith(last) && short.charAt(0) === initial) {
                let team = /<a[^>]*href=["'][^"']*?\bteam\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(tr);
                return { ...r, team: team ? cleanText(team[1]) : "", flag: r.flag || flagEmoji(tr) };
            }
        }
        return r;
    });
}

// Gesamtwertung, wenn der GC-Reiter auf der Seite leer ist:
// eigener Link des Reiters, dann übliche Adressen, zuletzt Klick im Browser
async function loadGC(race, path, html, stageNumber, stage) {
    let headed = parseGCTable(html);
    if (headed) return headed;
    let tab = findTab(html, "GC");
    if (tab && isGC(tab.rows, stage)) return tab.rows;
    // Eigene Seite der Gesamtwertung nach der letzten Etappe: race/tour-of-chongming-island/2026/stage-3-gc
    let sb = stageBase(race);
    if (sb && stageNumber && timeLeft() >= 8000) {
        try {
            let rows = parseGCTable(await load(`${sb}/stage-${stageNumber}-gc`));
            if (rows) return rows;
        } catch (e) {
            console.log(`GC über stage-${stageNumber}-gc: ${e}`);
        }
    }
    // Schnellster Weg: Wikipedia
    try {
        let rows = await wikiGC(race);
        // Gleicht die Wikipedia-GC der sichtbaren Tabelle, ist diese bereits die Gesamtwertung (mit Teams)
        if (rows && samePodium(rows, stage)) {
            let gc = stage.slice();
            gc.stageIsGC = true;
            return gc;
        }
        if (isGC(rows, stage)) return rows;
    } catch (e) {
        console.log(`GC über Wikipedia: ${e}`);
    }
    let base = race.path.replace(/[-\/](gc|result)$/, "");
    let candidates = [];
    if (tab && tab.path && tab.path !== path) candidates.push(tab.path);
    if (stageNumber) candidates.push(`${base}-stage-${stageNumber}-gc`, `${base}/stage-${stageNumber}-gc`);
    // Klassische Adresse der Schlusswertung: race/vuelta-a-espana/2026/gc
    let classic = base.replace(/-(\d{4})$/, "/$1");
    if (/\/\d{4}$/.test(classic)) candidates.push(`${classic}/gc`);
    for (let candidate of candidates) {
        if (timeLeft() < 8000) return null;
        try {
            let page = await load(candidate);
            let headed = parseGCTable(page);
            if (headed) return headed;
            let rows = parseTab(page, "GC");
            if (isGC(rows, stage)) return rows;
            // Seite ohne Reiter: sichtbare Tabelle
            if (rows === null && /gc$/.test(candidate)) {
                let podium = parsePodium(page);
                if (isGC(podium, stage)) return podium;
            }
        } catch (e) {
            console.log(`GC über ${candidate}: ${e}`);
        }
    }
    // Klick im unsichtbaren Browser dauert lange – nur in der App, nicht im Widget (Zeitlimit)
    if (config.runsInWidget || timeLeft() < 12000) return null;
    try {
        return (await loadGCInBrowser(path, stage)).gc;
    } catch (e) {
        console.log(`GC im Browser: ${e}`);
    }
    return null;
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

// Straßen-WM (Elite-Straßenrennen). Datum steht erst nach dem Rennen fest: einmal die Ergebnisseite
// laden und das Ergebnis dauerhaft speichern; vorher höchstens alle 12 Stunden nachsehen.
async function loadWorldChampionship(year, saved, revive) {
    let path = `race/world-championship${WOMEN ? "-we" : ""}/${year}`;
    let race = { name: "Weltmeisterschaft", flag: "🌈", path, stageRace: false, finished: true };
    let key = resultPath(race);
    if (saved[key] && saved[key].entries && saved[key].entries.length) {
        let e = revive(saved[key].entries[0]);
        return { ...race, start: e.start, end: e.end };
    }
    let checkKey = `wm-check-${path}`;
    if (saved[checkKey] && Date.now() - saved[checkKey].savedAt < 12 * 60 * 60 * 1000) return null;
    if (timeLeft() < 15000) return null;
    try {
        let html = await load(key);
        let date = parseDate(html);
        let podium = parsePodium(html);
        if (date && podium.length && date <= new Date()) {
            let found = { ...race, start: date, end: date };
            saved[key] = { entries: [{ ...found, label: "", date, path: key, podium }], savedAt: Date.now(), complete: true };
            saveResults(saved);
            return found;
        }
    } catch (e) {
        console.log(`WM: ${e}`);
    }
    saved[checkKey] = { savedAt: Date.now(), entries: [] };
    saveResults(saved);
    return null;
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

    let saved = loadSavedResults();
    let revive = e => ({ ...e, start: new Date(e.start), end: new Date(e.end), date: e.date ? new Date(e.date) : undefined });

    // Straßen-WM (nicht im WorldTour-Kalender, aber wichtiger) ergänzen
    let worlds = await loadWorldChampionship(year, saved, revive);
    if (worlds && !finished.some(r => resultPath(r) === resultPath(worlds))) finished.push(worlds);

    // Neueste zuerst; endet eine Rundfahrt am selben Tag wie ein Eintagesrennen, geht die Rundfahrt vor
    // (Vuelta 22.08.–13.09. vor dem GP de Montréal am 13.09.)
    finished.sort((a, b) => b.end - a.end || (b.stageRace ? 1 : 0) - (a.stageRace ? 1 : 0));
    upcoming.sort((a, b) => a.start - b.start);

    // Gezählt werden Ergebnisse, nicht Rennen: eine beendete Rundfahrt liefert GC und ihre letzten
    // Etappen (Guangxi: GC, Etappe 6, Etappe 5), eine laufende ihre letzten Etappen.
    // Zwei Durchgänge, damit das Zeitlimit reicht: zuerst die Rennseiten (Podium, Etappe),
    // danach mit der Restzeit Gesamtwertung (GC) und weitere Etappen.
    let running = upcoming.filter(r => r.stageRace && r.start <= today);
    let collected = []; // { race, entries, ctx, meta, needGC, needStages }
    let GC_RETRY = 12 * 60 * 60 * 1000; // fehlgeschlagene Suche frühestens nach 12 Stunden wiederholen
    let GC_VERSION = 4;
    let newestDate = race => race.finished ? race.end : today;

    // Daten der bisher gesammelten Ergebnisse, neueste zuerst. Noch nicht geladene Etappen einer
    // Rundfahrt werden geschätzt (eine je Tag vor dem Ende), damit ältere Rennen nicht unnötig laden.
    let virtualDates = () => collected.flatMap(c => {
        let dates = c.entries.map(e => e.date || c.race.end);
        if (c.race.stageRace && c.needStages) {
            for (let k = dates.length; k < CONFIG.past; k++) {
                let d = new Date(newestDate(c.race));
                d.setDate(d.getDate() - (c.race.finished ? Math.max(0, k - 1) : k));
                dates.push(d);
            }
        }
        return dates;
    }).sort((a, b) => b - a);
    // Kann das Rennen noch unter die neuesten drei Ergebnisse kommen?
    let outOfReach = race => {
        let third = virtualDates()[CONFIG.past - 1];
        let newest = newestDate(race);
        return Boolean(third && (newest < third || (newest.getTime() === third.getTime() && !race.stageRace)));
    };

    for (let race of running.concat(finished)) {
        if (outOfReach(race)) break;
        let key = resultPath(race);
        let stored = race.finished && saved[key];
        if (stored && race.stageRace) {
            let gcWithoutTeams = !stored.teamsTried
                && stored.entries.some(e => e.isGC && e.podium.length && e.podium.every(p => !p.team));
            let { entries, savedAt, ...meta } = stored;
            collected.push({
                race, entries: entries.map(revive), ctx: null, meta,
                // GC fehlte (oder ohne Teams aus Wikipedia) – erneut suchen
                // GC fehlte (oder ohne Teams aus Wikipedia) – erneut suchen; neue Suchwege (GC_VERSION) sofort
                needGC: gcWithoutTeams || (stored.complete === false
                    && (stored.gcVersion !== GC_VERSION || Date.now() - (stored.gcTry || 0) > GC_RETRY)),
                needStages: !stored.stagesDone && Date.now() - (stored.stageTry || 0) > GC_RETRY,
            });
            continue;
        }
        if (stored && stored.complete !== false) {
            collected.push({ race, entries: stored.entries.map(revive) });
            continue;
        }
        if (timeLeft() < 5000) {
            collected.push({ race, entries: [{ ...race, label: "", date: race.end, path: key, podium: [], debug: "Wird beim nächsten Aktualisieren geladen" }] });
            continue;
        }
        try {
            if (race.stageRace) {
                let result = await loadStageEntries(race, today, false);
                // Weder Etappe noch GC und Hinweis auf Absage: überspringen
                if (race.finished && result.entries.every(e => !e.podium.length)
                    && /cancel|abgesagt|annul/i.test(cleanText(result.ctx.html))) continue;
                let complete = result.entries.some(e => e.isGC);
                let item = {
                    race, entries: result.entries, ctx: result.ctx,
                    meta: { complete, gcTry: 0, stagesDone: false },
                    needGC: race.finished && !complete, needStages: true,
                };
                collected.push(item);
                if (race.finished) {
                    saved[key] = { entries: item.entries, savedAt: Date.now(), ...item.meta };
                    saveResults(saved);
                }
            } else {
                let html = await loadResultPage(key, hasPodium);
                let podium = parsePodium(html);
                // Kein Ergebnis und Hinweis auf Absage: Rennen überspringen, das nächste ältere nachrücken lassen
                if (!podium.length && /cancel|abgesagt|annul/i.test(cleanText(html))) continue;
                let entries = [{ ...race, label: "", date: race.end, path: key, podium, debug: podium.debug }];
                collected.push({ race, entries });
                if (race.finished && podium.length) {
                    saved[key] = { entries, savedAt: Date.now(), complete: true };
                    saveResults(saved);
                }
            }
        } catch (e) {
            console.log(`${race.name}: Ergebnis nicht geladen: ${e}`);
            collected.push({ race, entries: [{ ...race, label: "", date: race.end, path: key, podium: [], debug: String(e) }] });
        }
    }

    // Zweiter Durchgang: Gesamtwertungen und weitere Etappen, solange Zeit bleibt
    for (let item of collected) {
        if (!item.needGC && !item.needStages) continue;
        if (timeLeft() < 8000) break;
        let race = item.race, key = resultPath(race), meta = item.meta;
        if (outOfReach(race)) continue;
        try {
            if (!item.ctx && (item.needGC || meta.lastStage == null)) {
                item.ctx = (await loadStageEntries(race, today, false)).ctx;
            }
            let ctx = item.ctx;
            if (item.needGC) {
                let last = lastStageNumber(race, ctx);
                let gc = null;
                // Die Ergebnisseite …/gc zeigt die Gesamtwertung (mit Teams) – im GC-Reiter oder als sichtbare
                // Tabelle. Weicht eine davon von der letzten Etappe (eigene Seite) ab, ist sie die GC.
                let headed = race.finished ? parseGCTable(ctx.html) : null;
                if (headed) {
                    gc = headed.slice();
                    gc.stageIsGC = true;
                } else if (race.finished && last && timeLeft() >= 8000) {
                    let lastStage = await loadStage(race, last, saved, revive, race.end);
                    let tab = findTab(ctx.html, "GC");
                    let options = [tab && tab.rows, parsePodium(ctx.html), ctx.stagePodium];
                    let found = lastStage && options.find(rows => rows && rows.length && !samePodium(rows, lastStage.podium));
                    if (found) {
                        gc = found.slice();
                        gc.stageIsGC = true;
                    }
                }
                if (!gc) gc = await loadGC(race, ctx.path, ctx.html, last || ctx.number, ctx.stagePodium);
                let others = item.entries.filter(e => !e.isGC && e.podium.length);
                if (gc && gc.stageIsGC) {
                    // Die vermeintliche Etappe war die Gesamtwertung – als GC anzeigen
                    // Etappen von ihren eigenen Seiten bleiben
                    let stages = others.filter(e => e.stage != null && e.path !== ctx.path);
                    item.entries = [{ ...race, label: "GC", date: race.end, path: ctx.path, podium: gc.slice(), isGC: true }].concat(stages);
                    meta.complete = true;
                } else if (isGC(gc, ctx.stagePodium)) {
                    gc = withTeams(gc, ctx.html);
                    item.entries = [{ ...race, label: "GC", date: race.end, path: ctx.path, podium: gc, isGC: true }].concat(others);
                    meta.complete = true;
                    meta.teamsTried = true;
                } else {
                    meta.complete = item.entries.some(e => e.isGC);
                    meta.gcTry = Date.now();
                    meta.gcVersion = GC_VERSION;
                }
                item.needGC = false;
            }
            if (item.needStages) {
                meta.stagesDone = await addStages(item, ctx, saved, revive, today);
                if (!meta.stagesDone) meta.stageTry = Date.now();
                item.needStages = false;
            }
            if (race.finished) saved[key] = { entries: item.entries, savedAt: Date.now(), ...meta };
            saveResults(saved);
        } catch (e) {
            console.log(`${race.name}: GC/Etappen nicht geladen: ${e}`);
        }
    }

    // Neueste Ergebnisse zuerst; am selben Tag GC vor Etappe, Rundfahrt vor Eintagesrennen
    let weight = e => (e.isGC ? 2 : 0) + (e.stageRace ? 1 : 0);
    let entries = collected.flatMap(c => c.entries).sort((a, b) =>
        (b.running ? 1 : 0) - (a.running ? 1 : 0)
        || (b.date || b.end) - (a.date || a.end)
        || weight(b) - weight(a)
        || (b.stage || 0) - (a.stage || 0));

    return {
        past: entries.slice(0, CONFIG.past),
        upcoming: upcoming.filter(r => !running.includes(r)).slice(0, CONFIG.upcoming),
        stale: false,
    };
}

// Grundadresse der Etappenseiten: "race/tour-of-guangxi/2026/gc" → "race/tour-of-guangxi/2026"
function stageBase(race) {
    let m = /^(race\/[^/]+?)[\/-](\d{4})(?:[\/-]|$)/.exec(race.path);
    return m ? `${m[1]}/${m[2]}` : null;
}

// Nummer der letzten Etappe: laufend die gezeigte, beendet die höchste verlinkte
function lastStageNumber(race, ctx) {
    if (!ctx) return null;
    if (!race.finished) return ctx.number || null;
    let base = stageBase(race);
    let numbers = base ? [...ctx.html.matchAll(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/stage-(\\d+)`, "g"))]
        .map(m => Number(m[1])) : [];
    if (ctx.number) numbers.push(ctx.number);
    return numbers.length ? Math.max(...numbers) : null;
}

// Ergebnis einer Etappe; einmal gefunden, dauerhaft gespeichert
async function loadStage(race, n, saved, revive, approxDate) {
    let base = stageBase(race);
    if (!base) return null;
    let path = `${base}/stage-${n}`;
    let stored = saved[path];
    if (stored && stored.entries && stored.entries.length) return revive(stored.entries[0]);
    let html = "", podium = [], date = null;
    try {
        html = await load(path);
        let number = parseStageNumber(html);
        // Andere Seite (z. B. Weiterleitung auf die Übersicht) nicht als Etappe werten
        if (number === null || number === n) {
            let tab = parseTab(html, "STAGE");
            podium = tab && tab.length ? tab : parsePodium(html);
            date = parseDate(html);
        }
    } catch (e) {
        console.log(`${race.name} Etappe ${n}: ${e}`);
    }
    if (!podium.length && timeLeft() >= 6000) {
        try {
            let rows = await wikiStage(race, n);
            if (rows) podium = withTeams(rows, html);
        } catch (e) {
            console.log(`${race.name} Etappe ${n} über Wikipedia: ${e}`);
        }
    }
    if (!podium.length) return null;
    let entry = { ...race, label: `Etappe ${n}`, stage: n, date: date || approxDate, path, podium, running: false };
    saved[path] = { entries: [entry], savedAt: Date.now(), complete: true };
    return entry;
}

// Etappen einer Rundfahrt ergänzen: GC (falls vorhanden) und die letzten Etappen, zusammen 3 Einträge.
// Ergebnis: true, wenn nichts mehr fehlt.
async function addStages(item, ctx, saved, revive, today) {
    let race = item.race;
    let last = item.meta.lastStage != null ? item.meta.lastStage : lastStageNumber(race, ctx);
    if (last == null) return false;
    item.meta.lastStage = last;
    let gc = item.entries.find(e => e.isGC);
    // Laufend: die gerade geladene Etappe behalten; beendet: Etappen von ihren eigenen Seiten
    let known = race.finished ? [] : item.entries.filter(e => !e.isGC && e.stage != null);
    let wanted = CONFIG.past - (gc ? 1 : 0);
    let stages = [];
    let done = true;
    for (let n = last; n >= 1 && stages.length < wanted; n--) {
        let entry = known.find(e => e.stage === n);
        if (!entry) {
            if (timeLeft() < 6000) { done = false; break; }
            let approx = new Date(race.finished ? race.end : today);
            approx.setDate(approx.getDate() - (last - n));
            entry = await loadStage(race, n, saved, revive, approx);
        }
        if (!entry) { done = false; break; }
        stages.push(entry);
    }
    if (stages.length) item.entries = (gc ? [gc] : []).concat(stages);
    return done;
}

// Rundfahrt in Einträge aufteilen: letzte Etappe und – wenn beendet – Gesamtwertung.
// Ohne searchGC nur, was die Seite direkt hergibt (schnell); die GC-Suche übernimmt loadData.
// Ergebnis: { entries, ctx } – ctx enthält die geladene Seite für die spätere GC-Suche.
async function loadStageEntries(race, today, searchGC) {
    let path = resultPath(race);
    let html = await loadResultPage(path, hasStageOrGC);
    let isRunning = !race.finished;

    let number = parseStageNumber(html);
    let stagePodium = parseTab(html, "STAGE");
    let gcPodium = null;
    if (stagePodium === null && findTab(html, "GC") === null) {
        // Reiter nicht im HTML erkannt (z. B. Symbol-Reiter): die sichtbare Tabelle ist die Etappe
        let visible = parsePodium(html);
        stagePodium = visible.length ? visible : null;
    } else {
        let tab = findTab(html, "GC");
        if (tab && isGC(tab.rows, stagePodium)) gcPodium = tab.rows;
    }
    if (!isRunning && !gcPodium && searchGC) gcPodium = await loadGC(race, path, html, number, stagePodium);

    let stageLabel = number === 0 ? "Prolog" : number ? `Etappe ${number}` : "Letzte Etappe";
    let date = parseDate(html) || (isRunning ? today : race.end);

    let entries = [];
    // Gleicht die „Gesamtwertung“ der Etappe, ist sie nicht geladen worden – dann lieber weglassen
    if (!isRunning && isGC(gcPodium, stagePodium)) {
        entries.push({ ...race, label: "GC", date: race.end, path, podium: gcPodium, isGC: true });
    }
    if (stagePodium && stagePodium.length) {
        entries.push({ ...race, label: stageLabel, stage: number || undefined, date, path, podium: stagePodium, running: isRunning });
    }
    if (!entries.length) {
        let debug = (gcPodium && gcPodium.debug) || `${pageTitle(html)} · keine Etappen-/GC-Tabelle`;
        entries.push({ ...race, label: "", date: race.end, path, podium: [], debug });
    }
    return { entries, ctx: { path, html, number, stagePodium } };
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
            data.updated = Date.now();
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
        if (data.updated) UPDATED = data.updated;
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
    // Seitenverhältnis des Symbols beibehalten (das Fahrrad ist breiter als hoch)
    let natural = sym.image.size;
    img.imageSize = new Size(natural.height ? size * natural.width / natural.height : size, size);
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

// Schriftgröße der Fahrernamen – in Radsport- und Biathlon-Widgets gleich
const NAME_SIZE = 10.5;

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
        highlightGerman(row, p);
        addSymbol(row, `${i + 1}.circle.fill`, 12, MEDALS[i]);
        row.addSpacer(5);
        // Gleiche Namensgröße wie in den Biathlon-Widgets, ohne automatisches Verkleinern
        addLabel(row, withFlag(p.flag, p.rider), Font.mediumSystemFont(NAME_SIZE), WHITE).minimumScaleFactor = 1;
        row.addSpacer(6);
        row.addSpacer();
        addLabel(row, p.team, Font.regularSystemFont(10), WHITE, 0.55);
    });
}

function addUpcomingRace(stack, race, today) {
    let row = stack.addStack();
    row.centerAlignContent();
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
        addLabel(block, withFlag(race.flag, race.label ? `${race.name} · ${race.label}` : race.name), Font.semiboldSystemFont(12), WHITE);
        let winner = block.addStack();
        winner.centerAlignContent();
        highlightGerman(winner, race.podium[0]);
        addSymbol(winner, "trophy.fill", 10, MEDALS[0]);
        winner.addSpacer(4);
        addLabel(winner, race.podium[0] ? withFlag(race.podium[0].flag, race.podium[0].rider) : "–", Font.mediumSystemFont(NAME_SIZE), WHITE, 0.8);
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
        addLabel(block, withFlag(race.flag, race.name), Font.semiboldSystemFont(12), WHITE);
        let running = race.start <= today;
        addLabel(block, running ? "läuft" : formatRange(race), Font.regularSystemFont(11), WHITE, 0.6);
    });
    right.addSpacer();
}

async function createWidget() {
    let data = await loadWithCache();
    let widget = new ListWidget();
    // Antippen startet das Skript in Scriptable (frische Daten) statt eine Website zu öffnen
    widget.url = URLScheme.forRunningScript();
    widget.refreshAfterDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    background(widget);
    widget.setPadding(14, 16, 6, 16);

    if (config.widgetFamily === "medium") {
        buildMedium(widget, data);
    } else {
        buildLarge(widget, data);
    }
    if (data) addUpdated(widget);
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
