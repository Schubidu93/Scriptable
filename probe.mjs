const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
async function page(q) {
  let res = await fetch("https://worldathletics.org/competition/calendar-results?" + q, { headers: { "User-Agent": UA } });
  let html = await res.text();
  let next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(next[1]).props.pageProps;
}
let p = await page("startDate=2026-10-27&endDate=2027-10-27&disciplineId=5");
let ie = p.initialEvents;
console.log("pageProps keys", Object.keys(p));
console.log("initialEvents keys", Object.keys(ie));
console.log("options", JSON.stringify(ie.options).slice(0, 3000));
console.log("parameters", JSON.stringify(ie.parameters).slice(0, 800));
for (let k of Object.keys(p)) if (k !== "initialEvents") console.log(k, JSON.stringify(p[k]).slice(0, 1500));
