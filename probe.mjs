const E = "https://site.api.espn.com/apis/v2/sports/soccer/";
const groups = (n, o = []) => { if (!n) return o; if (n.standings && n.standings.entries) o.push(n); (n.children || []).forEach(c => groups(c, o)); return o; };
const ids = new Set();
for (const s of ["ger.1", "ger.2"]) {
  const j = await (await fetch(E + s + "/standings")).json();
  const e = groups(j).flatMap(g => g.standings.entries);
  console.log(s, e.length);
  e.forEach(x => ids.add(String(x.team.id)));
}
for (const s of ["uefa.champions", "uefa.europa", "uefa.europa.conf"]) {
  const j = await (await fetch(E + s + "/standings")).json();
  const e = groups(j).flatMap(g => g.standings.entries);
  console.log(s, e.length, "→", e.filter(x => ids.has(String(x.team.id))).map(x => x.team.displayName).join(", "));
}
