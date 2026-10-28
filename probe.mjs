const events = [];
for (const m of ["202608", "202609", "202610"]) {
  const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/scoreboard?dates=${m}&limit=200`)).json();
  events.push(...(j.events || []));
}
const names = new Set();
for (const e of events) for (const c of e.competitions[0].competitors) {
  const t = c.team; if (!(t.logo || (t.logos && t.logos[0]))) names.add(t.displayName);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wikiLogo(name) {
  let words = name.toLowerCase().split(/[^\p{L}\d]+/u).filter(w => w.length >= 4);
  let fits = page => page.thumbnail && words.some(w => page.title.toLowerCase().includes(w))
      && /\.svg|logo|wappen|emblem|signet/i.test(decodeURIComponent(page.thumbnail.source));
  for (let term of [`${name} Fußballverein`, `${name} Fußball`]) {
    await sleep(1500);
    const r = await fetch("https://de.wikipedia.org/w/api.php?format=json&action=query&generator=search"
      + `&gsrnamespace=0&gsrlimit=3&gsrsearch=${encodeURIComponent(term)}&prop=pageimages&piprop=thumbnail&pithumbsize=96`,
      { headers: { "User-Agent": "Scriptable-Fussball-Widget/1.0 (probe)" } });
    const text = await r.text(); if (!text.startsWith("{")) return "RATE LIMIT";
    const pages = Object.values(JSON.parse(text).query?.pages || {}).sort((a, b) => a.index - b.index);
    const page = pages.find(fits);
    if (page) return `${page.title} → ${decodeURIComponent(page.thumbnail.source.split("/").pop().split("?")[0])}`;
  }
  return "nichts";
}
console.log(`${names.size} Teams ohne Logo`);
for (const n of names) console.log(`${n} → ${await wikiLogo(n)}`);
