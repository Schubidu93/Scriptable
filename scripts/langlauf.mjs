// Loipenberichte rund um Kißlegg und im Großraum München: gespurte Kilometer (klassisch / Skating), Schneehöhe, Stand.
// Läuft stündlich per GitHub Actions und schreibt data/langlauf.json (gelesen von Langlauf.js).
// Quellen – wo möglich direkt beim Betreiber (Primärquelle), sonst Loipen-Allgäu (private Sammelseite,
// wird von Hand gepflegt und oft erst später aktualisiert):
//   Vogt: SC Vogt (Text-Bericht) · Waldburg: ASV Waldburg (Text-Bericht) · Bad Waldsee: Sportpark (Tabelle) · Isny: isny.de (je Loipe offen/zu,
//   zuletzt gespurt, Tagesmeldung) · Leutkirch: Loipen-Allgäu (km) + Stadt Leutkirch (gespurt am …) ·
//   Wangen: Loipen-Allgäu (km) + Skilift Berger Höhe/Niederwangen (Loipenzustand mit Datum) ·
//   Argenbühl, Missen-Wilhams, Heimenkirch, Lindenberg, Scheidegg: Loipen-Allgäu
//   (Missen meldet selbst nur über ein Skript-Widget).
// München: Schneebericht der Alpenregion Tegernsee-Schliersee (je Loipe befahrbar ja/nein, gespurte km) für Holzkirchen
//   bis Bayrischzell · Lenggries: Tourismus Lenggries (Text) · Baierbrunn: Altschützen (Text)
// Fällt eine Quelle aus, bleibt ihr letzter Stand aus der bisherigen Datei erhalten.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUTPUT = "data/langlauf.json";
const DEBUG = process.env.DEBUG === "1";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept-Language": "de-DE,de;q=0.9",
};

const ENTITIES = { auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", nbsp: " ", amp: "&",
    ndash: "–", mdash: "—", minus: "−", bull: "•", gt: ">", lt: "<", quot: "\"", acute: "´", shy: "" };

function decode(s) {
    return s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
        .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m))
        .replace(/­/g, ""); // weiche Trennstriche ("Loi­pe")
}

function text(html) {
    return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " "))
        .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function cells(row) {
    return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => text(m[1]).replace(/\s+/g, " ").trim());
}

const num = s => Number(String(s).replace(",", "."));

// "22.03.2026", "11.12.21" → "2026-03-22"
function isoDate(s) {
    let m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s || "");
    if (!m) return null;
    let year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// Ein zweiter Versuch nach kurzer Pause – einzelne Seiten antworten gelegentlich nicht
async function load(url) {
    try {
        return await loadOnce(url);
    } catch (e) {
        console.log(`${url}: ${e.message} – zweiter Versuch`);
        await new Promise(r => setTimeout(r, 4000));
        return loadOnce(url);
    }
}

async function loadOnce(url) {
    let res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    // Loipen-Allgäu liefert Latin-1
    let buffer = Buffer.from(await res.arrayBuffer());
    let type = res.headers.get("content-type") || "";
    let utf8 = buffer.toString("utf8");
    return /iso-8859-1|latin1|windows-1252/i.test(type) || (utf8.includes("�") && !/charset=utf-8/i.test(type))
        ? buffer.toString("latin1") : utf8;
}

// Loipen-Allgäu: "von insgesamt 120,00 Loipen-km sind aktuell 12,50 km gespurt, davon 8,00 km für die klassische
// Technik und 4,50 km für Skating · aktuelle Schneehöhe: 15 cm · zuletzt aktualisiert am 07.01.2026, um 12:07"
// Einzelloipen: je Loipe eine Tabelle <th colspan="5">Name</th> … "klassisch: 4.40 km | nicht gespurt!"
function loipenAllgaeuLoipen(html) {
    return html.split(/<th colspan="?5"?>/i).slice(1).map(block => {
        let name = text(block.slice(0, block.search(/<\/th>/i))).replace(/\s+/g, " ").trim()
            .replace(/^Loipe\s+/i, "").replace(/[-\s]*Loipe$/i, "");
        let state = technique => {
            let m = new RegExp(`${technique}:[\\s\\S]*?<\\/tr>`, "i").exec(block);
            if (!m) return null;
            let t = text(m[0]);
            return /gespurt/i.test(t) && !/nicht/i.test(t);
        };
        return { name, classic: state("klassisch"), skating: state("skating") };
    }).filter(l => l.name && (l.classic !== null || l.skating !== null));
}

async function loipenAllgaeu(name) {
    let html = await load(`http://www.loipen-allgaeu.de/loipen.php?name=${encodeURIComponent(name)}`);
    let t = text(html);
    let loipen = loipenAllgaeuLoipen(html);
    let groomedNames = loipen.filter(l => l.classic || l.skating).map(l => l.name);
    let total = /insgesamt\s+([\d.,]+)\s+Loipen-km sind aktuell\s+([\d.,]+)\s+km gespurt/i.exec(t);
    let split = /davon\s+([\d.,]+)\s+km f(?:ü|u)r die klassische Technik und\s+([\d.,]+)\s+km f(?:ü|u)r Skating/i.exec(t);
    if (!total || !split) throw new Error("Loipenbericht nicht gefunden");
    let snow = /Schneeh(?:ö|o)he:\s*(\d+)\s*cm/i.exec(t);
    let stamp = /aktualisiert am\s+(\d{1,2}\.\d{1,2}\.\d{4}),?\s*um\s*(\d{1,2}:\d{2})/i.exec(t);
    let groomed = num(total[2]);
    return {
        network: num(total[1]),
        groomed,
        classic: num(split[1]),
        skating: num(split[2]),
        snow: snow ? Number(snow[1]) : null,
        updated: stamp ? `${isoDate(stamp[1])}T${stamp[2].padStart(5, "0")}` : null,
        status: groomed > 0 || groomedNames.length ? "open" : "closed",
        // Nur die gespurten Loipen nennen ("gespurt: Haslach, Niederwangen - Bergerhoehe")
        note: groomedNames.length ? `gespurt: ${groomedNames.join(", ")}` : undefined,
    };
}

// ASV Waldburg: "Aktueller Loipenbericht (Stand: 12.01.2026)" mit freiem Text bis zum Hinweis auf den Loipenbutton
async function asvWaldburg() {
    let t = text(await load("https://www.asv-waldburg.de/ski/langlaufen/loipenbericht"));
    let start = t.search(/Aktueller Loipenbericht/i);
    if (start < 0) throw new Error("Loipenbericht nicht gefunden");
    let rest = t.slice(start);
    let stand = /Stand:?\s*([^)\n]*)/i.exec(rest);
    let body = rest.slice(rest.indexOf("\n") + 1, rest.search(/Wir würden uns freuen|Loipenbutton/i) >>> 0 || undefined)
        .split("\n").map(s => s.trim()).filter(Boolean).join(" ");
    let date = stand ? isoDate(stand[1]) : null;
    let closed = !body || /geschlossen|gesperrt|nicht gespurt|keine? (Loipen|Spur)|zu wenig Schnee/i.test(body);
    let open = !closed && /gespurt|befahrbar|geöffnet|offen/i.test(body);
    let first = body.split(/(?<=[.!])\s+/)[0] || "";
    return {
        network: null, groomed: null, classic: null, skating: null, snow: null,
        updated: date,
        status: !date ? "unknown" : closed ? "closed" : open ? "open" : "unknown",
        note: first ? (first.length > 108 ? first.slice(0, 104).replace(/\s+\S*$/, "") + " …" : first) : "kein aktueller Bericht",
    };
}

// SC Vogt: "Loipenbericht Vogt und News · 22.03.2026 · Liebe Langlauffreunde, wir haben den Winterbetrieb …"
async function scVogt() {
    let t = text(await load("https://www.sc-vogt.de/langlauf.html"));
    let start = t.search(/Loipenbericht Vogt und News/i);
    if (start < 0) throw new Error("Loipenbericht nicht gefunden");
    let rest = t.slice(start);
    let date = /(\d{1,2}\.\d{1,2}\.\d{4})/.exec(rest);
    let body = rest.slice(date ? date.index + date[0].length : 0)
        .replace(/^\s*Liebe Langlauf(?:freunde|fans)[^\n]*\n?/i, "")
        .split(/\n/).map(s => s.trim()).filter(Boolean);
    // Erster Satz des Berichts – kurz genug für eine Zeile im Widget
    let first = (body[0] || "").split(/(?<=[.!])\s+/)[0].replace(/\.{2,}$/, "").trim();
    let all = body.slice(0, 3).join(" ");
    let closed = /eingestellt|geschlossen|gesperrt|keine? (Loipen|Spur)|nicht gespurt|zu wenig Schnee/i.test(all);
    let open = !closed && /gespurt|ge­spurt|Loipenbetrieb|befahrbar|ist offen|geöffnet/i.test(all);
    let km = /(\d+(?:,\d+)?)\s*km\s+(?:gespurt|klassisch|skating)/i.exec(all);
    return {
        network: 30,
        groomed: km ? num(km[1]) : null,
        classic: null,
        skating: null,
        snow: null,
        updated: date ? isoDate(date[1]) : null,
        status: closed ? "closed" : open ? "open" : "unknown",
        note: first.length > 108 ? first.slice(0, 104).replace(/\s+\S*$/, "") + " …" : first,
    };
}

// Sportpark Bad Waldsee: Tabelle "Status | Schwierigkeit | Loipenname | Länge | Typ | Zuletzt gespurt | Zustand"
async function badWaldsee() {
    let html = await load("https://www.sportpark-badwaldsee.de/loipen-info");
    let rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => cells(m[0])).filter(c => c.length >= 7 && isoDate(c[5]) !== null);
    // Ohne <tr>-Tabelle (Baukasten-Seite): Textblöcke nach der Überschrift lesen
    if (!rows.length) {
        let t = text(html);
        let i = t.search(/Zuletzt gespurt/i);
        let words = t.slice(i).split(/\n/).map(s => s.trim()).filter(Boolean).slice(2);
        for (let k = 0; k + 6 < words.length; k++) {
            if (/^(offen|geöffnet|geschlossen|gesperrt|gespurt)$/i.test(words[k]) && isoDate(words[k + 5])) {
                rows.push(words.slice(k, k + 7));
                k += 6;
            }
        }
    }
    if (!rows.length) throw new Error("Loipentabelle nicht gefunden");
    let classic = 0, skating = 0, open = 0, network = 0;
    let dates = [];
    let openNames = [];
    for (let [status, , name, length, type, last] of rows) {
        let km = Math.max(...(length.match(/\d+(?:,\d+)?/g) || ["0"]).map(num));
        network += km;
        let date = isoDate(last);
        if (date) dates.push(date);
        if (/geschlossen|gesperrt/i.test(status)) continue;
        open++;
        openNames.push(name.replace(/\s*Loipe$/i, ""));
        if (/klassisch|einsteiger/i.test(type)) classic += km;
        if (/skating/i.test(type)) skating += km;
    }
    dates.sort();
    return {
        network: Math.round(network * 10) / 10,
        groomed: Math.round(Math.max(classic, skating) * 10) / 10,
        classic: Math.round(classic * 10) / 10,
        skating: Math.round(skating * 10) / 10,
        snow: null,
        updated: dates.length ? dates[dates.length - 1] : null,
        status: open ? "open" : "closed",
        // Nur die offenen Loipen nennen ("offen: Polarstern, Zauberwald")
        note: open ? `offen: ${openNames.join(", ")}` : "alle Loipen geschlossen",
    };
}

// Isny (isny.de, gepflegt von Isny Marketing): je Loipe Status, Name, Hinweis, Länge, Technik, zuletzt gespurt;
// dazu eine datierte Tagesmeldung ("22.10.: Der erste Schnee ist schon in Sichtweite.")
async function isny() {
    let t = text(await load("https://www.isny.de/freizeit-urlaub/wintersport/schneehoehen-loipenbericht.html"));
    let lines = t.split("\n").map(s => s.trim()).filter(Boolean);
    let start = lines.findIndex(l => /^Loipen$/i.test(l));
    if (start < 0) throw new Error("Loipenliste nicht gefunden");
    let loipen = [];
    for (let i = start + 1; i < lines.length; i++) {
        let line = lines[i];
        if (/^(geöffnet|offen|geschlossen|gesperrt|teilweise geöffnet|teilweise offen|in Vorbereitung)$/i.test(line)) {
            loipen.push({ status: line, name: lines[i + 1] || "", note: "", km: 0, technique: "", last: null });
            i++;
            continue;
        }
        let l = loipen[loipen.length - 1];
        if (!l) continue;
        let m;
        if ((m = /^Länge:\s*([\d.,]+)\s*(m|km)/i.exec(line))) l.km = m[2].toLowerCase() === "m" ? num(m[1].replace(/\./g, "")) / 1000 : num(m[1]);
        else if ((m = /^Technik:\s*(.*)$/i.exec(line))) l.technique = m[1];
        else if ((m = /^Zuletzt gespurt:\s*(.*)$/i.exec(line))) l.last = isoDate(m[1]) || (m[1].trim() ? m[1].trim() : null);
        else if (/^(Höhenanstieg|Schwierigkeit|Zustand):/i.test(line)) continue;
        else if (!l.note && !/^(Infos|Isny Info|Marktplatz)/i.test(line)) l.note = line;
        if (/^Isny Info|^Infos & Kontakt/i.test(line)) break;
    }
    if (!loipen.length) throw new Error("keine Loipen gelesen");
    let open = loipen.filter(l => !/geschlossen|gesperrt|Vorbereitung/i.test(l.status));
    let classic = open.filter(l => /klassisch/i.test(l.technique) && !/nur skating/i.test(l.note)).reduce((a, l) => a + l.km, 0);
    let skating = open.filter(l => /skating/i.test(l.technique) && !/nur klassisch/i.test(l.note)).reduce((a, l) => a + l.km, 0);
    let dates = loipen.map(l => typeof l.last === "string" && /^\d{4}-/.test(l.last) ? l.last : null).filter(Boolean).sort();
    // Tagesmeldung "22.10.: …" (ohne Jahr: liegt das Datum in der Zukunft, ist es das Vorjahr)
    let news = /(?:^|\n)\s*(\d{1,2})\.(\d{1,2})\.:?\s*([^\n]+)/.exec(t.slice(0, t.search(/\nLoipen\n/i) + 1 || undefined));
    let newsDate = null;
    if (news) {
        let now = new Date();
        let year = now.getFullYear();
        let d = new Date(year, Number(news[2]) - 1, Number(news[1]));
        if (d > now) year--;
        newsDate = `${year}-${news[2].padStart(2, "0")}-${news[1].padStart(2, "0")}`;
    }
    let updated = [dates[dates.length - 1], newsDate].filter(Boolean).sort().pop() || null;
    let round = x => Math.round(x * 10) / 10;
    return {
        network: round(loipen.reduce((a, l) => a + l.km, 0)),
        groomed: round(Math.max(classic, skating)),
        classic: round(classic),
        skating: round(skating),
        snow: null,
        updated,
        status: open.length ? "open" : "closed",
        // Offene Loipen beim Namen ("offen: Langlaufstadion, Gschwend, Sportplatz Maierhöfen"), sonst die Tagesmeldung
        note: open.length ? `offen: ${open.map(l => l.name.replace(/loipe\b/i, "").replace(/\s+in\s+/i, " ").trim()).join(", ")}`
            : news ? news[3].trim() : "alle Loipen geschlossen",
    };
}

// Skilift Berger Höhe (Niederwangen): "Aktuelle Informationen über den Liftbetrieb und den Loipenzustand: …
// Letzte Aktualisierung: Mittwoch, 07.01.2026, 12:23 Uhr"
async function bergerHoehe() {
    let t = text(await load("https://www.skilift-berger-hoehe.de/"));
    let block = /Loipenzustand:\s*([\s\S]*?)\s*Aktuelle Informationen der SG/i.exec(t);
    let stamp = /Letzte Aktualisierung:[^\d]*(\d{1,2}\.\d{1,2}\.\d{4}),?\s*(\d{1,2}:\d{2})?/i.exec(t);
    if (!block) throw new Error("Loipenzustand nicht gefunden");
    let sentences = block[1].split(/\n/).map(s => s.trim()).filter(Boolean);
    let loipe = sentences.find(s => /loipe|spur/i.test(s)) || sentences[0] || "";
    return {
        note: `Niederwangen: ${loipe}`,
        updated: stamp ? `${isoDate(stamp[1])}${stamp[2] ? "T" + stamp[2].padStart(5, "0") : ""}` : null,
        open: /gespurt|befahrbar|geöffnet/i.test(loipe) && !/nicht|zu wenig|kein/i.test(loipe),
    };
}

// Stadt Leutkirch: je Loipe "gespurt am" und Zustand (++, +, 0, -). Ergänzt Loipen-Allgäu um das Datum.
async function leutkirchStadt() {
    let html = await load("https://www.leutkirch.de/de/Urlaub/Natur-Bewegung/Langlaufen/Loipenbericht");
    // Abschnitte: Leutkirch, Winterstetten, Herlazhofen & Urlau, Friesenhofen, Wuchzenhofen, Hofs & Ausnang, Engerazhofen
    let rows = [];
    let section = "Leutkirch";
    for (let m of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
        let c = cells(m[0]);
        if (c.length >= 2 && /Laufstil/i.test(c[1])) section = c[0];
        else if (c.length === 4 && /klass|skat/i.test(c[1])) rows.push({ section, name: c[0], style: c[1], date: isoDate(c[2]), condition: c[3] });
    }
    let groomed = rows.filter(r => r.date).sort((a, b) => b.date.localeCompare(a.date));
    let latest = groomed.length ? groomed[0].date : null;
    let recent = groomed.filter(r => latest && (new Date(latest) - new Date(r.date)) <= 2 * 86400000);
    let sections = [...new Set(recent.map(r => r.section))];
    return { latest, loipen: rows.length, recent: recent.length, names: recent.map(r => r.name), sections };
}

// ---------- Großraum München ----------

// Alpenregion Tegernsee-Schliersee (gemeinsamer Schneebericht der Tourist-Infos, z. B. bayrischzell.de/schneebericht):
// je Ort Schneehöhe, Infotext und "Daten zuletzt aktualisiert am 17.03.26 um 08:42 Uhr"; die Loipenliste je Ort lädt die
// Seite nach (/de/action/module_placeholder) – je Loipe "Zustand: befahrbar / nicht befahrbar", "Klassisch gespurt: 4,3km" …
const ATS = "https://www.bayrischzell.de";
let atsPage = null;

async function atsPlaces() {
    if (!atsPage) atsPage = load(`${ATS}/schneebericht`).then(html => {
        let places = {};
        for (let block of html.split(/<div class="snowHeights__element"/).slice(1)) {
            let name = /<h2>([^<]+)<\/h2>/.exec(block);
            let ident = /id="(address_\d+)_CrossCountry"/.exec(block);
            if (!name || !ident) continue;
            let t = text(block);
            let snow = /Schneeh(?:ö|o)he Tal:\s*(\d+)\s*cm/i.exec(t);
            let stamp = /aktualisiert am\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s+um\s+(\d{1,2}:\d{2})/i.exec(t);
            let info = /snowHeights__element__information">([\s\S]*?)<\/div>/.exec(block);
            places[decode(name[1]).trim()] = {
                ident: ident[1],
                snow: snow ? Number(snow[1]) : null,
                updated: stamp ? `${isoDate(stamp[1])}T${stamp[2].padStart(5, "0")}` : null,
                // Infotext ohne Eislauf-/Rodel-Teil: "Schneebericht für die Saison eingestellt."
                info: info ? text(info[1]).split(/\n/).map(x => x.trim()).filter(x => x && !/^Loipen$/i.test(x))
                    .find(x => !/eis|rodel|telefon|skigebiet|lift|hier\s*\.?$/i.test(x)) || null : null,
            };
        }
        if (!Object.keys(places).length) throw new Error("Schneebericht nicht gefunden");
        return places;
    });
    return atsPage;
}

async function ats(place) {
    let p = (await atsPlaces())[place];
    if (!p) throw new Error(`${place} fehlt im Schneebericht`);
    let html = await load(`${ATS}/de/action/module_placeholder?blockType=${encodeURIComponent("body\\snowReport\\CrossCountryMapListBlock")}`
        + `&blockIdent=${p.ident}`);
    let loipen = html.split(/<article class="mapList__element/).slice(1).map(article => {
        let t = text(article).replace(/\s+/g, " ");
        let km = label => {
            let m = new RegExp(`${label} gespurt:?\\s*([\\d,]+)\\s*km`, "i").exec(t);
            return m ? num(m[1]) : 0;
        };
        let name = /<h3>([\s\S]*?)<\/h3>/.exec(article);
        let state = /Zustand:\s*([^:]+?)\s+(?:Nachtloipe|Gesamtlänge|Weitere Infos)/i.exec(t);
        return {
            name: name ? text(name[1]).replace(/\s+/g, " ").trim() : "",
            state: state ? state[1].trim() : null,
            classic: km("Klassisch"),
            skating: km("Skating"),
        };
    }).filter(l => l.name);
    if (!loipen.length) throw new Error("keine Loipen gelesen");
    let open = loipen.filter(l => l.state && !/nicht|gesperrt|geschlossen/i.test(l.state));
    let round = x => Math.round(x * 10) / 10;
    let classic = round(open.reduce((a, l) => a + l.classic, 0));
    let skating = round(open.reduce((a, l) => a + l.skating, 0));
    return {
        network: null,
        groomed: round(Math.max(classic, skating)),
        classic: open.length ? classic : null,
        skating: open.length ? skating : null,
        snow: p.snow,
        updated: p.updated,
        status: open.length ? "open" : loipen.some(l => l.state) ? "closed" : "unknown",
        // Nur befahrbare Loipen nennen, sonst den Hinweis des Orts ("Schneebericht für die Saison eingestellt.")
        note: open.length ? `befahrbar: ${open.map(l => l.name).join(", ")}` : p.info || undefined,
    };
}

// Freitext-Berichte: "wieder in Betrieb" vom März darf im Herbst nicht als gespurt gelten – ältere Meldungen zählen nicht als offen
const recent = (iso, days = 10) => iso && (Date.now() - new Date(iso).getTime()) / 86400000 <= days;

// Tourismus Lenggries: "Loipenbericht Lenggries: Langlaufloipe Hinterriss-Eng ab 28.03.26 wieder in Betrieb!"
async function lenggries() {
    let t = text(await load("https://www.lenggries.de/aktiv/winter/schneebericht")).replace(/[ \t]+/g, " ");
    let report = /Loipenbericht Lenggries:?\s*([^\n©]+)/i.exec(t);
    if (!report) throw new Error("Loipenbericht nicht gefunden");
    let body = report[1].trim();
    let stamp = /(\d{1,2}\.\d{1,2}\.\d{4})\s*\|\s*(\d{1,2}:\d{2})\s*Uhr/.exec(t);
    let snow = /Schneeh(?:ö|o)he Tal(?:\/Lifte)?:?\s*(\d+)\s*cm/i.exec(t);
    let closed = /geschlossen|gesperrt|nicht (gespurt|befahrbar|möglich)|keine? (Loipen|Spur)|eingestellt|zu wenig Schnee/i.test(body);
    let updated = stamp ? `${isoDate(stamp[1])}T${stamp[2].padStart(5, "0")}` : null;
    let open = !closed && /gespurt|befahrbar|in Betrieb|geöffnet|offen/i.test(body) && recent(updated);
    return {
        network: null, groomed: null, classic: null, skating: null,
        snow: snow ? Number(snow[1]) : null,
        updated,
        status: closed ? "closed" : open ? "open" : "unknown",
        note: body.length > 108 ? body.slice(0, 104).replace(/\s+\S*$/, "") + " …" : body,
    };
}

// Altschützen Baierbrunn (Vereinsloipe, nur klassisch): "12. Januar 2026: … Noch nicht ausreichend für eine Loipe. … Keine Loipe."
const MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

async function baierbrunn() {
    let t = text(await load("http://www.altschuetzen-baierbrunn.de/Loipe.html")).replace(/\s+/g, " ");
    let m = /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4}):?\s*([^*]*)/i.exec(t);
    if (!m) throw new Error("Loipenbericht nicht gefunden");
    let date = `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    let body = m[4].replace(/Bilder leider[^.]*\.{0,3}\s*/i, "").trim();
    let closed = /keine Loipe|nicht ausreichend|nicht (gespurt|befahrbar)|geschlossen|gesperrt|zu wenig Schnee/i.test(body);
    let open = !closed && /gespurt|befahrbar|Loipe ist (gezogen|offen)/i.test(body) && recent(date);
    let last = body.split(/(?<=[.!])\s+/).filter(Boolean).pop() || "";
    return {
        network: null, groomed: null, classic: null, skating: null, snow: null,
        updated: date,
        status: closed ? "closed" : open ? "open" : "unknown",
        note: last.length > 108 ? last.slice(0, 104).replace(/\s+\S*$/, "") + " …" : last,
    };
}

// region: Allgäu (ab Kißlegg) oder München; km: Autostrecke ab Rathaus Kißlegg bzw. Marienplatz (OSRM, Okt. 2026)
const AREAS = [
    { id: "vogt", region: "allgaeu", km: 11.6, name: "Vogt", load: scVogt, url: "https://www.sc-vogt.de/langlauf.html" },
    { id: "waldburg", region: "allgaeu", km: 15.9, name: "Waldburg", load: asvWaldburg, url: "https://www.asv-waldburg.de/ski/langlaufen/loipenbericht" },
    { id: "waldsee", region: "allgaeu", km: 23.2, name: "Bad Waldsee", load: badWaldsee, url: "https://www.sportpark-badwaldsee.de/loipen-info" },
    { id: "leutkirch", region: "allgaeu", km: 16.7, name: "Leutkirch", load: () => loipenAllgaeu("Leutkirch"),
        url: "https://www.leutkirch.de/de/Urlaub/Natur-Bewegung/Langlaufen/Loipenbericht" },
    { id: "wangen", region: "allgaeu", km: 20.9, name: "Wangen", load: () => loipenAllgaeu("Wangen"), url: "http://www.loipen-allgaeu.de/loipen.php?name=Wangen" },
    { id: "isny", region: "allgaeu", km: 22.5, name: "Isny", load: isny, fallback: () => loipenAllgaeu("Isny / Maierhoefen"),
        url: "https://www.isny.de/freizeit-urlaub/wintersport/schneehoehen-loipenbericht.html" },
    { id: "argenbuehl", region: "allgaeu", km: 18.6, name: "Argenbühl", load: () => loipenAllgaeu("Argenbuehl"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Argenbuehl" },
    { id: "missen", region: "allgaeu", km: 37.2, name: "Missen-Wilhams", load: () => loipenAllgaeu("Missen-Wilhams"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Missen-Wilhams" },
    // Weitere Gebiete in der Nähe (Westallgäu) – das Widget zeigt sie, wenn dort gespurt ist
    { id: "heimenkirch", region: "allgaeu", km: 25.4, name: "Heimenkirch", load: () => loipenAllgaeu("Heimenkirch"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Heimenkirch" },
    { id: "lindenberg", region: "allgaeu", km: 28.4, name: "Lindenberg", load: () => loipenAllgaeu("Lindenberg"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Lindenberg" },
    { id: "scheidegg", region: "allgaeu", km: 45.6, name: "Scheidegg", load: () => loipenAllgaeu("Scheidegg"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Scheidegg" },
    // Großraum München – Alpenregion Tegernsee-Schliersee, Lenggries und die Vereinsloipe Baierbrunn
    { id: "baierbrunn", region: "muenchen", km: 15.6, name: "Baierbrunn", load: baierbrunn, url: "http://www.altschuetzen-baierbrunn.de/Loipe.html" },
    { id: "holzkirchen", region: "muenchen", km: 35.1, name: "Holzkirchen", load: () => ats("Holzkirchen"), url: `${ATS}/schneebericht` },
    { id: "warngau", region: "muenchen", km: 38.4, name: "Warngau", load: () => ats("Warngau"), url: `${ATS}/schneebericht` },
    { id: "gmund", region: "muenchen", km: 47.8, name: "Gmund", load: () => ats("Gmund"), url: `${ATS}/schneebericht` },
    { id: "waakirchen", region: "muenchen", km: 48.3, name: "Waakirchen", load: () => ats("Waakirchen"), url: `${ATS}/schneebericht` },
    { id: "hausham", region: "muenchen", km: 51.9, name: "Hausham", load: () => ats("Hausham"), url: `${ATS}/schneebericht` },
    { id: "badwiessee", region: "muenchen", km: 52.6, name: "Bad Wiessee", load: () => ats("Bad Wiessee"), url: `${ATS}/schneebericht` },
    { id: "schliersee", region: "muenchen", km: 53.8, name: "Schliersee", load: () => ats("Schliersee"), url: `${ATS}/schneebericht` },
    { id: "rottach", region: "muenchen", km: 55.9, name: "Rottach-Egern", load: () => ats("Rottach-Egern"), url: `${ATS}/schneebericht` },
    { id: "lenggries", region: "muenchen", km: 62.0, name: "Lenggries", load: lenggries, url: "https://www.lenggries.de/aktiv/winter/schneebericht" },
    { id: "kreuth", region: "muenchen", km: 63.1, name: "Kreuth", load: () => ats("Kreuth"), url: `${ATS}/schneebericht` },
    { id: "fischbachau", region: "muenchen", km: 65.5, name: "Fischbachau", load: () => ats("Fischbachau"), url: `${ATS}/schneebericht` },
    { id: "bayrischzell", region: "muenchen", km: 76.0, name: "Bayrischzell", load: () => ats("Bayrischzell"), url: `${ATS}/schneebericht` },
];

async function main() {
    let previous = {};
    try {
        for (let a of JSON.parse(await readFile(OUTPUT, "utf8")).areas) previous[a.id] = a;
    } catch (e) {}

    let areas = [];
    for (let area of AREAS) {
        let entry;
        try {
            entry = { id: area.id, region: area.region, km: area.km, name: area.name, url: area.url, ...(await area.load()) };
        } catch (e) {
            console.log(`::warning::${area.name}: ${e.stack || e.message}`);
            // Primärquelle ausgefallen: Loipen-Allgäu als Ersatz
            if (area.fallback) {
                try {
                    entry = { id: area.id, region: area.region, km: area.km, name: area.name, url: area.url, ...(await area.fallback()), source: "Loipen-Allgäu" };
                    areas.push(entry);
                    continue;
                } catch (e2) {
                    console.log(`::warning::${area.name} (Ersatz): ${e2.message}`);
                }
            }
            entry = previous[area.id] ? { ...previous[area.id], region: area.region, km: area.km, stale: true }
                : { id: area.id, region: area.region, km: area.km, name: area.name, url: area.url, status: "unknown" };
        }
        areas.push(entry);
    }

    // Leutkirch: Datum und Zahl der gespurten Loipen von der Stadt, wenn neuer als Loipen-Allgäu
    try {
        let city = await leutkirchStadt();
        let lk = areas.find(a => a.id === "leutkirch");
        if (DEBUG) console.log("Stadt Leutkirch:", JSON.stringify(city));
        if (city.latest && (!lk.updated || city.latest >= lk.updated.slice(0, 10))) {
            lk.updated = city.latest;
            // Welche Ortschaften gespurt sind (die Entfernung gilt für die Wilhelmshöhe)
            lk.note = `${city.recent} von ${city.loipen} Loipen gespurt${city.sections.length ? ": " + city.sections.join(", ") : ""}`;
            if (city.recent && lk.status !== "open") lk.status = "open";
        }
    } catch (e) {
        console.log(`::warning::Stadt Leutkirch: ${e.message}`);
    }

    // Waldburg: Ohne eigenen ASV-Bericht gilt der des SC Vogt – gemeinsames Loipennetz Vogt-Waldburg
    let wb = areas.find(a => a.id === "waldburg");
    let vg = areas.find(a => a.id === "vogt");
    if (wb && vg && (wb.status === "unknown" || !wb.updated) && vg.updated) {
        wb.status = vg.status;
        wb.updated = vg.updated;
        wb.groomed = vg.groomed;
        wb.note = "laut SC Vogt (Netz Vogt-Waldburg)";
        wb.source = "SC Vogt";
    }

    // Wangen: Meldung der Berger Höhe (Niederwangen), wenn neuer als Loipen-Allgäu
    try {
        let berger = await bergerHoehe();
        let wg = areas.find(a => a.id === "wangen");
        if (DEBUG) console.log("Berger Höhe:", JSON.stringify(berger));
        if (berger.updated && (!wg.updated || berger.updated.slice(0, 10) >= wg.updated.slice(0, 10))) {
            wg.updated = berger.updated;
            wg.note = berger.note;
            if (berger.open) wg.status = "open";
        }
    } catch (e) {
        console.log(`::warning::Berger Höhe: ${e.message}`);
    }

    areas.forEach(a => console.log(`${a.name.padEnd(15)} ${a.status.padEnd(7)} klassisch ${a.classic ?? "–"} · Skating ${a.skating ?? "–"} · `
        + `Schnee ${a.snow ?? "–"} · Stand ${a.updated ?? "–"}${a.note ? " · " + a.note : ""}${a.stale ? " (alt)" : ""}`));

    // Nur schreiben, wenn sich etwas geändert hat (sonst entstünde jede Stunde ein Commit)
    let old = "";
    try { old = JSON.stringify(JSON.parse(await readFile(OUTPUT, "utf8")).areas); } catch (e) {}
    if (old === JSON.stringify(areas)) {
        console.log("Keine Änderung.");
        return;
    }
    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({ generated: new Date().toISOString(), areas }, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
