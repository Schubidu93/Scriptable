const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const base = "https://www.bayrischzell.de";
const html = await (await fetch(base + "/schneebericht", { headers: UA })).text();
const js = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]).find(s => s.includes("vendor"));
const code = await (await fetch(new URL(js, base), { headers: UA })).text();
console.log("JS length", code.length);
for (const kw of ["placeholder_x", "block-type", "blockType", "block-ident", "blockIdent", "ajax", "/portal/", "XMLHttpRequest", "fetch("]) {
  let i = -1, n = 0;
  while ((i = code.indexOf(kw, i + 1)) >= 0 && n < 3) { n++; console.log(`\n== ${kw} @${i}: ` + code.slice(Math.max(0, i - 400), i + 400)); }
}
// Langlauf-Abschnitte im HTML
const i = html.indexOf("Langlaufen in Bayrischzell");
console.log("\n\nHTML:", html.slice(i - 200, i + 800));
