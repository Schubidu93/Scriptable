const events = [];
for (const m of ["202608", "202609", "202610"]) {
  const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/scoreboard?dates=${m}&limit=200`)).json();
  events.push(...(j.events || []));
}
const teams = new Map();
for (const e of events) for (const c of e.competitions[0].competitors) {
  const t = c.team; const logo = t.logo || (t.logos && t.logos[0] && t.logos[0].href);
  if (!logo) teams.set(t.displayName, t);
}
console.log(`${events.length} Spiele, ${teams.size} Teams ohne Logo`);
for (const name of teams.keys()) {
  const url = "https://de.wikipedia.org/w/api.php?format=json&action=query&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch="
    + encodeURIComponent(`${name} Fußballverein`) + "&prop=pageimages&piprop=thumbnail&pithumbsize=96";
  const j = await (await fetch(url, { headers: { "User-Agent": "Scriptable-Fussball-Widget/1.0" } })).json();
  const page = Object.values((j.query && j.query.pages) || {})[0];
  console.log(`${name} → ${page ? page.title : "-"} → ${page && page.thumbnail ? page.thumbnail.source.split("/").pop() : "kein Bild"}`);
  await new Promise(r => setTimeout(r, 300));
}
