const E = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const groups = (n, o = []) => { if (!n) return o; if (n.standings && n.standings.entries) o.push(n); (n.children || []).forEach(c => groups(c, o)); return o; };
for (const lvl of ["", "?level=2", "?level=3"]) {
  const j = await (await fetch(E + lvl)).json();
  const g = groups(j);
  console.log("LEVEL", lvl || "default", g.map(x => `${x.abbreviation || x.name}:${x.standings.entries.length}`).join(" "));
  if (lvl === "?level=2" || lvl === "") {
    const e = g[0].standings.entries[0];
    console.log("STATS", e.stats.map(s => `${s.name || s.type}=${s.displayValue}`).join(" | "));
    console.log("ORDER", g[0].standings.entries.map(x => `${x.team.abbreviation}(${(x.stats.find(s => s.name === "playoffSeed") || {}).value}|${(x.stats.find(s => s.name === "wins") || {}).value}-${(x.stats.find(s => s.name === "losses") || {}).value})`).join(" "));
  }
}
