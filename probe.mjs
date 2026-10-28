const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Accept-Language": "de-DE,de;q=0.9" };
const r = await fetch("https://www.bayrischzell.de/schneebericht", { headers: UA });
const html = await r.text();
console.log("SCRIPTS:", [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]).join(" | "));
for (const kw of ["placeholder_x", "ajax", "blockIdent", "data-block", "loadBlock", "/api/"]) {
  const i = html.indexOf(kw, html.indexOf("</body") - 200000 > 0 ? html.indexOf("</body") - 200000 : 0);
  console.log(`\n== ${kw} @${i}: ` + (i >= 0 ? html.slice(Math.max(0, i - 300), i + 300).replace(/\s+/g, " ") : "-"));
}
// Inline-Skripte mit "block"
const inl = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => /block|ajax|fetch|xhr/i.test(s));
console.log("\nINLINE:", inl.map(s => s.slice(0, 600)).join("\n----\n"));
