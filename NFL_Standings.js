// NFL – Tabelle. Mittleres Widget: alle 32 Teams nach Setzliste, je Conference zwei Spalten (1–8 | 9–16);
// Division-Sieger (1–4) mit goldener Ziffer, ab Platz 8 blass. Großes Widget: alle acht Divisions.
// Lieblingsteam (Standard "CLE") gold hinterlegt.
// Team im Loader per Function("TEAM", code)("pit") oder als Widget-Parameter, z. B. "kc".
// Quelle: ESPN (öffentliche Schnittstelle).

const ESPN = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const FAVORITE = String((typeof TEAM !== "undefined" && TEAM) || args.widgetParameter || "cle").trim().toUpperCase();
const FAMILY = config.widgetFamily || "medium";
const LARGE = FAMILY === "large" || FAMILY === "extraLarge";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), `nfl-standings-${LARGE ? "div" : "conf"}.json`);

const WHITE = Color.white();
const GOLD = new Color("#FFD60A");
const FAV_BACKGROUND = new Color("#FFE08A", 0.35);

let UPDATED = Date.now();

// ---------- Daten ----------

function collectGroups(node, out = []) {
    if (!node) return out;
    if (node.standings && node.standings.entries) out.push(node);
    (node.children || []).forEach(child => collectGroups(child, out));
    return out;
}

function stat(entry, name) {
    let s = (entry.stats || []).find(x => x.name === name || x.type === name);
    return s ? Number(s.value) : 0;
}

function logoUrl(team) {
    if (team.logos && team.logos.length) return team.logos[0].href;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;
}

function row(e) {
    let ties = stat(e, "ties");
    return {
        abbr: e.team.abbreviation,
        logo: logoUrl(e.team),
        seed: stat(e, "playoffSeed"),
        record: `${stat(e, "wins")}-${stat(e, "losses")}${ties ? "-" + ties : ""}`,
        pct: stat(e, "winPercent"),
    };
}

// level=2: AFC/NFC (Setzliste), level=3: acht Divisions (mit Conference davor)
async function loadData() {
    try {
        let req = new Request(`${ESPN}?level=${LARGE ? 3 : 2}&_=${Math.floor(Date.now() / 600000)}`);
        req.timeoutInterval = 15;
        let json = await req.loadJSON();
        let groups;
        if (LARGE) {
            groups = (json.children || []).flatMap(conf => collectGroups(conf).map(div => ({
                conf: conf.abbreviation || conf.name,
                name: `${conf.abbreviation || ""} ${div.abbreviation || div.name}`.trim(),
                rows: div.standings.entries.map(row).sort((a, b) => b.pct - a.pct || (a.seed || 99) - (b.seed || 99)),
            })));
        } else {
            groups = collectGroups(json).map(conf => ({
                name: conf.abbreviation || conf.name,
                rows: conf.standings.entries.map(row).sort((a, b) => (a.seed || 99) - (b.seed || 99)),
            }));
        }
        if (!groups.length) throw new Error("keine Tabelle");
        let data = { generated: new Date().toISOString(), groups };
        fm.writeString(cachePath, JSON.stringify(data));
        return data;
    } catch (e) {
        console.log(`ESPN: ${e}`);
        if (!fm.fileExists(cachePath)) return null;
        let data = JSON.parse(fm.readString(cachePath));
        data.stale = true;
        UPDATED = new Date(data.generated).getTime();
        return data;
    }
}

// ESPN-Logos (500 px) über den Bildserver klein laden – sonst reicht der Widget-Speicher nicht
function smallLogo(url) {
    let m = /^https?:\/\/a\.espncdn\.com(\/i\/[^?]+)/.exec(url || "");
    return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=48&h=48` : url;
}

async function loadLogos(urls) {
    let images = {};
    await Promise.all([...new Set(urls)].map(async url => {
        try {
            images[url] = await new Request(smallLogo(url)).loadImage();
        } catch (e) {
            console.log(`Logo nicht geladen: ${url}`);
        }
    }));
    return images;
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

function background(widget) {
    let gradient = new LinearGradient();
    gradient.colors = [new Color("#1F3A6B"), new Color("#0B1A33")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
}

// Eine Tabellenzeile: Platz/Setzung, Logo, Kürzel, Bilanz
function addTeamRow(stack, r, images, rank, opts) {
    let line = stack.addStack();
    line.centerAlignContent();
    line.setPadding(0, opts.pad ?? 2, 0, opts.pad ?? 2);
    if (r.abbr === FAVORITE) {
        line.backgroundColor = FAV_BACKGROUND;
        line.cornerRadius = 3;
    }
    // Platz rechtsbündig über ein Ziffern-Leerzeichen (U+2007) statt flexiblem Abstand – der kostet in Scriptable
    // mindestens 8 pt, dann blieb von "10"–"16" nur "1" übrig
    let num = line.addStack();
    num.size = new Size(opts.numW || 16, 0);
    addLabel(num, String(rank).padStart(2, "\u2007"), Font.semiboldMonospacedSystemFont(opts.size - 1), opts.rankColor || WHITE, opts.rankColor ? 1 : 0.6);
    line.addSpacer(opts.gap ?? 5);
    if (images[r.logo]) line.addImage(images[r.logo]).imageSize = new Size(opts.logo, opts.logo);
    else line.addSpacer(opts.logo);
    line.addSpacer(opts.gap ?? 5);
    if (opts.abbrW) {
        // Feste Spalten statt flexiblem Abstand (der kostet mindestens 8 pt) – vier Spalten passen sonst nicht
        let abbr = line.addStack();
        abbr.size = new Size(opts.abbrW, 0);
        addLabel(abbr, r.abbr, Font.semiboldSystemFont(opts.size), WHITE, opts.dim ? 0.55 : 1).minimumScaleFactor = 0.8;
        line.addSpacer(3);
        let rec = line.addStack();
        rec.size = new Size(opts.recW, 0);
        addLabel(rec, r.record, Font.mediumMonospacedSystemFont(opts.size), WHITE, opts.dim ? 0.55 : 0.9).minimumScaleFactor = 0.75;
        return;
    }
    addLabel(line, r.abbr, Font.semiboldSystemFont(opts.size), WHITE, opts.dim ? 0.55 : 1);
    line.addSpacer();
    addLabel(line, r.record, Font.mediumMonospacedSystemFont(opts.size), WHITE, opts.dim ? 0.55 : 0.9);
}

// Mittel: alle 16 Teams einer Conference in zwei Spalten (Setzliste 1–8 | 9–16); Division-Sieger (1–4) gold,
// Wildcards (5–7) weiß, ab Platz 8 (außerhalb der Playoffs) blass
// Spaltenbreiten aus der Widget-Breite (je nach iPhone 329–364 pt): feste Teile (Platz, Logo, Abstände) und der Rest
// für Kürzel und Bilanz – so bleibt in der Mitte nur ein schmaler Abstand und "10"–"16" bzw. "4-2-1" passen
const MID_GAP = 10, HALF_GAP = 4, SIDE_PAD = 12;

function mediumWidth() {
    let w = Device.screenSize().width;
    return w >= 428 ? 364 : w >= 390 ? 338 : 329;
}

function compactOptions() {
    let col = (mediumWidth() - 2 * SIDE_PAD - MID_GAP - 2 * HALF_GAP) / 4;
    let fixed = 11 + 2 + 9 + 2; // Platz (zwei Ziffern), Abstand, Logo, Abstand
    let rest = Math.floor(col - fixed) - 3; // abzüglich Abstand Kürzel–Bilanz
    // Kürzel brauchen Platz für breite Buchstaben ("WSH"), Bilanzen meist nur "5-2"
    let abbrW = Math.round(rest * 0.5);
    return { size: 9, logo: 9, numW: 11, gap: 2, abbrW, recW: rest - abbrW, pad: 0 };
}

function addConference(stack, group, images) {
    [group.rows.slice(0, 8), group.rows.slice(8, 16)].forEach((list, half) => {
        if (half > 0) stack.addSpacer(HALF_GAP);
        let col = stack.addStack();
        col.layoutVertically();
        addLabel(col, half === 0 ? group.name : " ", Font.semiboldSystemFont(9), WHITE, 0.6);
        col.addSpacer(1);
        list.forEach((r, i) => {
            let rank = r.seed || half * 8 + i + 1;
            if (i > 0) col.addSpacer(1);
            addTeamRow(col, r, images, rank, { ...compactOptions(), rankColor: rank <= 4 ? GOLD : null, dim: rank >= 8 });
        });
    });
}

// Groß: zwei Spalten (AFC | NFC), je vier Divisions mit vier Teams
function addDivision(col, group, images) {
    addLabel(col, group.name, Font.semiboldSystemFont(9), WHITE, 0.6);
    col.addSpacer(1);
    group.rows.forEach((r, i) => {
        addTeamRow(col, r, images, i + 1, { size: 11, logo: 12, rankColor: i === 0 ? GOLD : null });
    });
}

async function createWidget() {
    let data = await loadData();
    let widget = new ListWidget();
    background(widget);
    widget.setPadding(LARGE ? 12 : 10, LARGE ? 14 : SIDE_PAD, LARGE ? 6 : 8, LARGE ? 14 : SIDE_PAD);
    widget.refreshAfterDate = new Date(Date.now() + 3 * 60 * 60000);
    widget.url = "https://www.espn.com/nfl/standings";

    let header = widget.addStack();
    header.centerAlignContent();
    addLabel(header, "🏈 NFL", Font.semiboldSystemFont(LARGE ? 15 : 13));
    header.addSpacer(6);
    addLabel(header, LARGE ? "Divisions" : "Setzliste", Font.semiboldSystemFont(LARGE ? 12 : 11), WHITE, 0.7);
    header.addSpacer();
    let df = new DateFormatter();
    df.dateFormat = "HH:mm";
    addLabel(header, `${data && data.stale ? "offline · " : ""}${df.string(new Date(UPDATED))}`, Font.mediumSystemFont(9), WHITE, 0.5);
    widget.addSpacer(LARGE ? 8 : 3);

    if (!data) {
        addLabel(widget, "Keine Tabelle – später erneut versuchen", Font.mediumSystemFont(12), WHITE, 0.8);
        widget.addSpacer();
        return widget;
    }
    let images = await loadLogos(data.groups.flatMap(g => g.rows.map(r => r.logo)));
    let body = widget.addStack();
    if (LARGE) {
        ["AFC", "NFC"].forEach((conf, c) => {
            if (c > 0) body.addSpacer(16);
            let col = body.addStack();
            col.layoutVertically();
            data.groups.filter(g => g.conf === conf).forEach((g, i) => {
                if (i > 0) col.addSpacer(7);
                addDivision(col, g, images);
            });
        });
    } else {
        data.groups.slice(0, 2).forEach((g, i) => {
            if (i > 0) body.addSpacer(MID_GAP);
            addConference(body, g, images);
        });
    }
    widget.addSpacer();
    return widget;
}

async function main() {
    let widget = await createWidget();
    if (config.runsInWidget) Script.setWidget(widget);
    else if (LARGE) await widget.presentLarge();
    else await widget.presentMedium();
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
