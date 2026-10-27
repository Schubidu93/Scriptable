for (let slug of ["uefa.europa", "uefa.europa.conf"]) {
  let res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=202610&limit=200`);
  let j = await res.json().catch(() => ({}));
  let ev = j.events || [];
  console.log(slug, res.status, ev.length, "Spiele", ev.slice(0, 3).map(e => `${e.date.slice(0,10)} ${e.shortName}`).join(" | "), "Liga:", j.leagues && j.leagues[0] && j.leagues[0].name);
}
