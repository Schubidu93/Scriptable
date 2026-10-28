const j = await (await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/scoreboard?dates=202610&limit=200")).json();
const teams = new Map();
for (const e of j.events) for (const c of e.competitions[0].competitors) teams.set(c.team.id, c.team);
const t = await (await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/teams/124")).json().catch(() => null);
console.log("Team 124:", t && t.team && t.team.displayName, JSON.stringify(t && t.team && t.team.logos && t.team.logos.map(l => [l.href, l.rel])));
for (const [id, team] of teams) {
  if (!team.logo) continue;
  const dark = team.logo.replace("/500/", "/500-dark/");
  const r = await fetch(dark, { method: "HEAD" });
  const cr = await fetch(`https://a.espncdn.com/combiner/i?img=${new URL(dark).pathname}&w=64&h=64`, { method: "HEAD" });
  console.log(team.abbreviation, team.displayName, team.logo.split("/").slice(-2).join("/"), "dark:", r.status, "combiner:", cr.status, cr.headers.get("content-length"));
}
