// Wettkampfkalender: die nächsten großen Wettkämpfe aus dem öffentlichen World-Athletics-Kalender.
// Läuft täglich im Leichtathletik-Workflow und schreibt data/leichtathletik_kalender.json (je 10 Termine).
//   Bahn (Track and Field): weltweit ab Gold Label (OW, DF, GW, GL), in Europa ab Kategorie A,
//                           in Deutschland ab Kategorie B
//   Straße (Road Running):  weltweit ab Gold Label, in Europa ab Kategorie A, in Deutschland ab Kategorie E
// Die Kalenderseite enthält ihre Daten eingebettet (__NEXT_DATA__); je Kategorie ein Abruf.

import { writeFile, mkdir } from "node:fs/promises";

const CALENDAR = "https://worldathletics.org/competition/calendar-results";
const OUTPUT = "data/leichtathletik_kalender.json";
const COUNT = 10; // mittleres Widget zeigt 5, großes 10
const DAYS_AHEAD = 365;
const GERMANY = "regionType=country&regionId=13188422";
const EUROPE = "regionType=area&regionId=3";

// Kategorie-Kennungen des Kalenders
const CATEGORY_IDS = { OW: 4, DF: 11, GW: 5, GL: 6, A: 1, B: 2, C: 3, D: 9, E: 7 };
const DISCIPLINES = { track: 5, road: 2 };

// Höhere Kategorien sind in den weiteren Regionen schon enthalten – je Region nur die zusätzlichen
const QUERIES = {
    track: [
        { region: "", categories: ["OW", "DF", "GW", "GL"] },
        { region: EUROPE, categories: ["A"] },
        { region: GERMANY, categories: ["B"] },
    ],
    road: [
        { region: "", categories: ["OW", "DF", "GW", "GL"] },
        { region: EUROPE, categories: ["A"] },
        { region: GERMANY, categories: ["B", "C", "D", "E"] },
    ],
};

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

async function loadCategory(discipline, region, category, from, to) {
    let url = `${CALENDAR}?startDate=${isoDate(from)}&endDate=${isoDate(to)}&disciplineId=${DISCIPLINES[discipline]}`
        + `&rankingCategoryId=${CATEGORY_IDS[category]}${region ? "&" + region : ""}`;
    let res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    let html = await res.text();
    let next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (!next) throw new Error("keine eingebetteten Kalenderdaten");
    let events = JSON.parse(next[1]).props.pageProps.initialEvents;
    return (events.results || []).map(e => ({
        id: e.id,
        name: e.name,
        venue: e.venue,
        category: e.rankingCategory,
        group: e.competitionGroup,
        startDate: e.startDate,
        endDate: e.endDate || e.startDate,
    }));
}

async function main() {
    let today = new Date();
    let to = new Date(today.getTime() + DAYS_AHEAD * 86400000);
    let output = { generated: today.toISOString() };
    let failures = 0;

    for (let [discipline, queries] of Object.entries(QUERIES)) {
        let byId = {};
        for (let { region, categories } of queries) {
            for (let category of categories) {
                try {
                    (await loadCategory(discipline, region, category, today, to)).forEach(e => { byId[e.id] = e; });
                } catch (e) {
                    failures++;
                    console.log(`${discipline} ${category}${region === GERMANY ? " (DE)" : region === EUROPE ? " (EU)" : ""}: ${e.message}`);
                }
            }
        }
        let todayIso = isoDate(today);
        output[discipline] = Object.values(byId)
            .filter(e => e.endDate >= todayIso)
            .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
            .slice(0, COUNT);
        console.log(`${discipline}:`);
        output[discipline].forEach(e => console.log(`  ${e.startDate} [${e.category}] ${e.name} – ${e.venue}`));
    }

    if (!output.track.length && !output.road.length) {
        console.log(`::warning::Keine Wettkämpfe gefunden (${failures} Fehler) – Datei bleibt unverändert.`);
        return;
    }
    await mkdir("data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
    console.log(`Geschrieben: ${OUTPUT}`);
}

main();
