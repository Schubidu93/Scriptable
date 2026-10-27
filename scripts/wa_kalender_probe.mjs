// Einmaliger Test: Filter-Parameter und Kategorie-IDs des öffentlichen Kalenders
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" };
async function page(url) {
    const html = await (await fetch(url, { headers: UA })).text();
    const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    return next ? JSON.parse(next[1]).props.pageProps : null;
}
const w = await page("https://worldathletics.org/competition/calendar-results?startDate=2026-10-27&endDate=2027-12-31");
console.log("query:", JSON.stringify(w.query));
console.log("parameters:", JSON.stringify(w.initialEvents.parameters));
console.log("rankingCategories:", JSON.stringify(w.initialEvents.options.rankingCategories));
console.log("disciplines:", JSON.stringify(w.initialEvents.options.disciplines));
console.log("competitionGroups:", JSON.stringify(w.initialEvents.options.competitionGroups).slice(0, 2500));
// Versuch mit Kategorie- und Disziplinfilter (Namen wie im Link: disciplineId, regionId …)
for (const extra of ["&rankingCategoryId=1", "&rankingCategoryId=3", "&disciplineId=5&rankingCategoryId=3", "&page=2", "&offset=100"]) {
    const p = await page("https://worldathletics.org/competition/calendar-results?startDate=2026-10-27&endDate=2027-12-31" + extra);
    const r = p.initialEvents.results || [];
    console.log(`${extra}: Treffer ${p.initialEvents.hits}, Seite ${p.initialEvents.paginationPage}, erste: ${JSON.stringify(r.slice(0, 3).map(e => [e.name, e.startDate, e.rankingCategory]))}`);
}
