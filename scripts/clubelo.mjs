// ClubElo-Rangliste: aktuelle Top 10 und der Stand vor einem Monat (Rang und Elo-Punkte).
// Läuft täglich per GitHub Actions und schreibt data/clubelo.json.
// Ist ClubElo nicht erreichbar, bleibt die alte Datei stehen.

import { writeFile, mkdir } from "node:fs/promises";

const API = "http://api.clubelo.com/";
const OUTPUT = "data/clubelo.json";
const TOP = 10;
const COMPARE_DAYS = 30;

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

// CSV: Rank,Club,Country,Level,Elo,From,To – Vereine ohne Rang ("None") werden nach Elo eingeordnet
async function loadRanking(date) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            let res = await fetch(API + isoDate(date));
            if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
            let lines = (await res.text()).trim().split(/\r?\n/);
            let header = lines.shift().split(",");
            let col = name => header.indexOf(name);
            let clubs = lines.map(line => line.split(",")).map(c => ({
                club: c[col("Club")],
                country: c[col("Country")],
                elo: Math.round(Number(c[col("Elo")])),
            })).filter(c => c.club && c.elo);
            clubs.sort((a, b) => b.elo - a.elo);
            clubs.forEach((c, i) => { c.rank = i + 1; });
            if (!clubs.length) throw new Error("leere Liste");
            return clubs;
        } catch (e) {
            console.log(`ClubElo ${isoDate(date)}, Versuch ${attempt}: ${e.message}`);
            await new Promise(r => setTimeout(r, 5000 * attempt));
        }
    }
    return null;
}

async function main() {
    let today = new Date();
    let before = new Date(today.getTime() - COMPARE_DAYS * 86400000);
    let [now, then] = await Promise.all([loadRanking(today), loadRanking(before)]);
    if (!now) {
        console.error("ClubElo nicht erreichbar – Datei bleibt unverändert.");
        process.exitCode = 1;
        return;
    }
    let previous = {};
    (then || []).forEach(c => { previous[c.club] = c; });

    let clubs = now.slice(0, TOP).map(c => ({
        rank: c.rank,
        club: c.club,
        country: c.country,
        elo: c.elo,
        prevRank: previous[c.club] ? previous[c.club].rank : null,
        prevElo: previous[c.club] ? previous[c.club].elo : null,
    }));
    clubs.forEach(c => console.log(`${c.rank}. ${c.club} (${c.country}) ${c.elo} · vor ${COMPARE_DAYS} Tagen: ${c.prevRank ?? "–"}. / ${c.prevElo ?? "–"}`));

    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify({
        generated: today.toISOString(),
        date: isoDate(today),
        compareDate: then ? isoDate(before) : null,
        clubs,
    }, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
