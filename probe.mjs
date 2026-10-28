for (let slug of ["ger.1", "uefa.champions"]) {
  let j = await (await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`)).json();
  let groups = [];
  (function walk(n) { if (!n) return; if (n.standings && n.standings.entries) groups.push(n); (n.children || []).forEach(walk); })(j);
  let g = groups.sort((a, b) => b.standings.entries.length - a.standings.entries.length)[0];
  console.log("\n==", slug, g.name, g.standings.entries.length);
  let e = g.standings.entries[0];
  console.log("stats:", e.stats.map(s => `${s.name || s.type}=${s.displayValue}`).join(", "));
  console.log("team:", JSON.stringify({ id: e.team.id, name: e.team.displayName, short: e.team.shortDisplayName, abbr: e.team.abbreviation }));
  let notes = {};
  g.standings.entries.forEach((x, i) => { if (x.note) notes[x.note.description + " " + x.note.color] = (notes[x.note.description + " " + x.note.color] || []).concat(i + 1); });
  console.log("notes:", JSON.stringify(notes));
}
