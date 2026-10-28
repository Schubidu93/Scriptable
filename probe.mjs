for (let slug of ["uefa.champions", "uefa.europa", "ger.1"]) {
  let res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);
  let j = await res.json().catch(e => ({ err: e.message }));
  let groups = [];
  (function walk(n) { if (!n) return; if (n.standings && n.standings.entries) groups.push(n); (n.children || []).forEach(walk); })(j);
  console.log(slug, res.status, "Gruppen:", groups.map(g => `${g.name}(${g.standings.entries.length})`).join(", "), j.err || "");
  let g = groups.sort((a, b) => b.standings.entries.length - a.standings.entries.length)[0];
  if (g) console.log("  erste:", g.standings.entries.slice(0, 3).map(e => `${e.team.abbreviation} ${e.stats.find(s => s.name === "points")?.displayValue}`).join(" | "));
}
