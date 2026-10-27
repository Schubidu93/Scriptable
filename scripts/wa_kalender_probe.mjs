// Einmaliger Test: Aufbau der eingebetteten Kalenderdaten der öffentlichen Kalenderseite
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" };
async function page(url) {
    const html = await (await fetch(url, { headers: UA })).text();
    const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    return next ? JSON.parse(next[1]).props.pageProps : null;
}
const p = await page("https://worldathletics.org/competition/calendar-results?startDate=2026-10-26&regionId=13188422&regionType=country&disciplineId=2");
const ev = p.initialEvents;
console.log("pageProps-Schlüssel:", Object.keys(p).join(", "));
console.log("initialEvents-Schlüssel:", Object.keys(ev).join(", "));
console.log("options-Schlüssel:", Object.keys(ev.options || {}).join(", "));
for (const [k, v] of Object.entries(ev.options || {})) {
    if (k !== "regions") console.log(`option ${k}:`, JSON.stringify(v).slice(0, 1200));
}
console.log("Erster Wettkampf:", JSON.stringify((ev.results || [])[0], null, 1));
console.log("Alle Treffer:", JSON.stringify((ev.results || []).map(r => [r.name, r.startDate, r.rankingCategory, r.disciplines, r.competitionGroup, r.competitionSubgroup])));
// Ohne Länderfilter, ab heute, nur Kategorie-Infos der ersten Treffer
const w = await page("https://worldathletics.org/competition/calendar-results?startDate=2026-10-27&endDate=2027-06-30");
console.log("Welt Treffer:", w.initialEvents.hits, "auf Seite:", (w.initialEvents.results || []).length);
console.log("Welt Beispiele:", JSON.stringify((w.initialEvents.results || []).slice(0, 12).map(r => [r.name, r.startDate, r.rankingCategory, r.disciplines, r.competitionGroup, r.competitionSubgroup, r.area, r.country])));
