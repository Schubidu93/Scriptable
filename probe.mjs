const E = "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/";
for (const q of ["dates=20261027-20261028", "dates=20261028", ""]) {
  const j = await (await fetch(E + "scoreboard?" + q)).json();
  console.log("Q", q, Object.keys(j), (j.events || []).length, j.message || "");
}
const board = await (await fetch(E + "scoreboard?dates=20261028")).json();
const ev = board.events.find(e => e.competitions[0].competitors.some(c => c.team.id === "132")) || board.events[0];
const comp = ev.competitions[0];
console.log("EVENT", ev.id, ev.name, comp.status.type.state);
console.log("DETAILS", JSON.stringify((comp.details || []).slice(0, 3), null, 1).slice(0, 2500));
const sch = await (await fetch(E + "teams/132/schedule")).json();
const sev = (sch.events || []).find(e => e.id === ev.id);
console.log("SCHEDULE has details:", !!(sev && sev.competitions[0].details), sev && Object.keys(sev.competitions[0]));
const sum = await (await fetch(E + "summary?event=" + ev.id)).json();
console.log("SUMMARY keys", Object.keys(sum));
const goals = (sum.keyEvents || []).filter(k => k.scoringPlay);
console.log("KEYEVENT", JSON.stringify(goals.slice(0, 2), null, 1).slice(0, 2500));
