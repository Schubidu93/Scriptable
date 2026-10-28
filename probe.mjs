const E = "https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/";
for (const q of ["dates=20261027-20261028", "dates=20261027-20261028&_=1", "dates=20261028", "dates=20261028&_=5", "dates=202610", ""]) {
  const r = await fetch(E + "scoreboard?" + q);
  const j = await r.json();
  console.log("Q", JSON.stringify(q), r.status, (j.events || []).length, j.message || j.code || "");
}
