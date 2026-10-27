for (let slug of ["uefa.europa.conf", "cro.1"]) {
  let j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams?limit=200`)).json().catch(() => ({}));
  let teams = (((j.sports || [])[0] || {}).leagues || [{}])[0].teams || [];
  console.log(slug, teams.length, "Teams");
  teams.map(t => t.team).filter(t => /hajduk|split/i.test(t.displayName + t.name)).forEach(t => console.log("  ", t.id, t.displayName, t.abbreviation));
}
let id = process.argv[2];
let s = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard?dates=2026&limit=1000`)).json();
let hits = (s.events || []).filter(e => /hajduk/i.test(JSON.stringify(e.competitions[0].competitors.map(c => c.team.displayName))));
console.log("ECL 2026 Spiele mit Hajduk:", hits.length, hits.slice(0, 6).map(e => `${e.date.slice(0,10)} ${e.name}`).join(" | "));
hits.slice(0,1).forEach(e => e.competitions[0].competitors.forEach(c => console.log("  team", c.team.id, c.team.displayName)));
