const B = "https://api.biathlonresults.com/modules/sportapi/api/";
for (let id of ["BT2526SWRLCP__SMNC", "BT2526SWRLCP__SWNC", "BT2526SWRLCP__SMTS"]) {
  try {
    let j = await (await fetch(B + "CupResults?CupId=" + id)).json();
    console.log(id, j.CupName || j.Name, (j.Rows || []).length, "Zeilen:", (j.Rows || []).slice(0, 5).map(r => `${r.Rank} ${r.Name}/${r.ShortName} ${r.Nat} ${r.Score}`).join(" | "));
  } catch (e) { console.log(id, e.message); }
}
let cups = await (await fetch(B + "Cups?SeasonId=2526")).json().catch(() => []);
console.log("Cups:", (cups || []).filter(c => /NC|nation/i.test(c.CupId + c.Description)).slice(0, 10).map(c => c.CupId + "=" + c.Description).join(" | "));
