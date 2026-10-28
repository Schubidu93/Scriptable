// Loipenberichte rund um Kißlegg: gespurte Kilometer (klassisch / Skating), Schneehöhe, Stand.
// Läuft stündlich per GitHub Actions und schreibt data/langlauf.json (gelesen von Langlauf.js).
// Quellen – wo möglich direkt beim Betreiber (Primärquelle), sonst Loipen-Allgäu (private Sammelseite,
// wird von Hand gepflegt und oft erst später aktualisiert):
//   Vogt: SC Vogt (Text-Bericht) · Bad Waldsee: Sportpark (Tabelle) · Isny: isny.de (je Loipe offen/zu,
//   zuletzt gespurt, Tagesmeldung) · Leutkirch: Loipen-Allgäu (km) + Stadt Leutkirch (gespurt am …) ·
//   Wangen: Loipen-Allgäu (km) + Skilift Berger Höhe/Niederwangen (Loipenzustand mit Datum) ·
//   Argenbühl, Missen-Wilhams: Loipen-Allgäu (Missen meldet selbst nur über ein Skript-Widget).
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
async function loipenAllgaeu(name) {
    let t = text(await load(`http://www.loipen-allgaeu.de/loipen.php?name=${encodeURIComponent(name)}`));
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
        status: groomed > 0 ? "open" : "closed",
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
        note: first.length > 70 ? first.slice(0, 68).replace(/\s+\S*$/, "") + " …" : first,
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
    for (let [status, , , length, type, last] of rows) {
        let km = Math.max(...(length.match(/\d+(?:,\d+)?/g) || ["0"]).map(num));
        network += km;
        let date = isoDate(last);
        if (date) dates.push(date);
        if (/geschlossen|gesperrt/i.test(status)) continue;
        open++;
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
        note: open ? `${open} von ${rows.length} Loipen offen` : "alle Loipen geschlossen",
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
        note: news ? news[3].trim() : open.length ? `${open.length} von ${loipen.length} Loipen offen` : "alle Loipen geschlossen",
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
    let rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => cells(m[0])).filter(c => c.length === 4 && /klass|skat/i.test(c[1]));
    let groomed = rows.map(c => ({ name: c[0], style: c[1], date: isoDate(c[2]), condition: c[3] })).filter(r => r.date);
    groomed.sort((a, b) => b.date.localeCompare(a.date));
    let latest = groomed.length ? groomed[0].date : null;
    let recent = groomed.filter(r => latest && (new Date(latest) - new Date(r.date)) <= 2 * 86400000);
    return { latest, loipen: rows.length, recent: recent.length, names: recent.map(r => r.name) };
}

const AREAS = [
    { id: "vogt", name: "Vogt", load: scVogt, url: "https://www.sc-vogt.de/langlauf.html" },
    { id: "waldsee", name: "Bad Waldsee", load: badWaldsee, url: "https://www.sportpark-badwaldsee.de/loipen-info" },
    { id: "leutkirch", name: "Leutkirch", load: () => loipenAllgaeu("Leutkirch"),
        url: "https://www.leutkirch.de/de/Urlaub/Natur-Bewegung/Langlaufen/Loipenbericht" },
    { id: "wangen", name: "Wangen", load: () => loipenAllgaeu("Wangen"), url: "http://www.loipen-allgaeu.de/loipen.php?name=Wangen" },
    { id: "isny", name: "Isny", load: isny, fallback: () => loipenAllgaeu("Isny / Maierhoefen"),
        url: "https://www.isny.de/freizeit-urlaub/wintersport/schneehoehen-loipenbericht.html" },
    { id: "argenbuehl", name: "Argenbühl", load: () => loipenAllgaeu("Argenbuehl"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Argenbuehl" },
    { id: "missen", name: "Missen-Wilhams", load: () => loipenAllgaeu("Missen-Wilhams"),
        url: "http://www.loipen-allgaeu.de/loipen.php?name=Missen-Wilhams" },
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
            entry = { id: area.id, name: area.name, url: area.url, ...(await area.load()) };
        } catch (e) {
            console.log(`::warning::${area.name}: ${e.stack || e.message}`);
            // Primärquelle ausgefallen: Loipen-Allgäu als Ersatz
            if (area.fallback) {
                try {
                    entry = { id: area.id, name: area.name, url: area.url, ...(await area.fallback()), source: "Loipen-Allgäu" };
                    areas.push(entry);
                    continue;
                } catch (e2) {
                    console.log(`::warning::${area.name} (Ersatz): ${e2.message}`);
                }
            }
            entry = previous[area.id] ? { ...previous[area.id], stale: true } : { id: area.id, name: area.name, url: area.url, status: "unknown" };
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
            lk.note = `${city.recent} von ${city.loipen} Loipen gespurt`;
            if (city.recent && lk.status !== "open") lk.status = "open";
        }
    } catch (e) {
        console.log(`::warning::Stadt Leutkirch: ${e.message}`);
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
