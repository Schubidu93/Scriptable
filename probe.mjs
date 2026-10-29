const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9", "Accept": "application/json" };
const j = async (u, opt = {}) => { try { const r = await fetch(u, { headers: { ...UA, ...(opt.headers || {}) }, method: opt.method || "GET", body: opt.body, signal: AbortSignal.timeout(20000) }); const t = await r.text(); return [r.status, t]; } catch (e) { return ["ERR", e.message]; } };
// A) transport.rest
let [s, t] = await j("https://v6.db.transport.rest/locations?query=Kisslegg&results=2");
console.log("A loc", s, t.slice(0, 300));
// B) bahn.de vendo
let ids = {};
for (const q of ["Kißlegg", "München Hbf"]) {
  [s, t] = await j(`https://www.bahn.de/web/api/reiseloesung/orte?suchbegriff=${encodeURIComponent(q)}&typ=ALL&limit=2`);
  console.log("B orte", q, s, t.slice(0, 400));
  try { ids[q] = JSON.parse(t)[0]; } catch (e) {}
}
const now = new Date(Date.now() - 3600000 + 3600000); // UTC; Berlin = +1 im Winter
const local = new Date(Date.now() + 3600000 - 3600000).toISOString(); 
const berlin = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T");
console.log("berlin", berlin);
const body = {
  abfahrtsHalt: ids["München Hbf"]?.id, ankunftsHalt: ids["Kißlegg"]?.id, anfrageZeitpunkt: berlin, ankunftSuche: "ABFAHRT",
  klasse: "KLASSE_2", produktgattungen: ["ICE", "EC_IC", "IR", "REGIONAL", "SBAHN", "BUS", "SCHIFF", "UBAHN", "TRAM", "ANRUFPFLICHTIG"],
  reisende: [{ typ: "ERWACHSENER", ermaessigungen: [{ art: "KEINE_ERMAESSIGUNG", klasse: "KLASSENLOS" }], alter: [], anzahl: 1 }],
  schnelleVerbindungen: true, sitzplatzOnly: false, bikeCarriage: false, reservierungsKontingenteVorhanden: false,
  nurDeutschlandTicketVerbindungen: false, deutschlandTicketVorhanden: false, maxUmstiege: 0,
};
[s, t] = await j("https://www.bahn.de/web/api/angebote/fahrplan", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json; charset=utf-8" } });
console.log("B fahrplan", s, t.length);
try {
  const d = JSON.parse(t);
  console.log("keys", Object.keys(d));
  for (const v of (d.verbindungen || []).slice(0, 5)) {
    const a = v.verbindungsAbschnitte;
    console.log("V umst", v.umstiegsAnzahl, a.map(x => `${x.verkehrsmittel?.name}|${x.abfahrtsZeitpunkt}|ez ${x.ezAbfahrtsZeitpunkt}|${x.ankunftsZeitpunkt}|ez ${x.ezAnkunftsZeitpunkt}|${x.abfahrtsOrt}->${x.ankunftsOrt}`).join(" || "));
  }
  console.log("V0 keys", Object.keys(d.verbindungen[0]), Object.keys(d.verbindungen[0].verbindungsAbschnitte[0]));
  console.log("V0 sample", JSON.stringify(d.verbindungen[0].verbindungsAbschnitte[0]).slice(0, 1500));
  console.log("ctx", JSON.stringify({ frueher: d.frueherContext, spaeter: d.spaeterContext }).slice(0, 300));
} catch (e) { console.log(t.slice(0, 800)); }
