import { readFileSync } from "node:fs";
const src = readFileSync("Fussball.js", "utf8");
const grab = name => { let i = src.search(new RegExp(`^(async )?function ${name}\\(`, "m")); let j = src.indexOf("\n}\n", i); return src.slice(i, j + 2); };
const grabConst = name => { let i = src.indexOf(`const ${name} =`); let j = src.indexOf("];\n", i); return src.slice(i, j + 3); };
const code = [grabConst("ROUND_WORDS"), grabConst("KO_ROUNDS"), ...["eventTexts","roundOf","shortAbbr","logoUrl","statusOf","stateOf","score","liveDetail","resultSuffix","toGame","buildBracketData"].map(grab)].join("\n");
const germanTeam = t => ({ name: t.shortDisplayName, abbr: t.abbreviation });
const EUROPE = true;
const f = new Function("germanTeam", "EUROPE", code + "\nreturn { buildBracketData, roundOf, eventTexts };")(germanTeam, EUROPE);
for (const slug of ["uefa.champions", "uefa.europa", "uefa.europa.conf"]) {
  let events = [];
  for (const m of ["202602", "202603", "202604", "202605"]) {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${m}&limit=200`);
    const j = await r.json(); events.push(...(j.events || []));
  }
  console.log(`\n=== ${slug}: ${events.length} Spiele`);
  console.log([...new Set(events.map(e => f.roundOf(e) + " ← " + f.eventTexts(e).slice(0, 90)))].slice(0, 12).join("\n"));
  const c = events.find(e => e.competitions[0].competitors.some(x => "advance" in x));
  console.log("advance-Feld vorhanden:", Boolean(c));
  const b = f.buildBracketData(events);
  if (!b) { console.log("kein Baum"); continue; }
  console.log("aktuell:", b.current);
  for (const r of b.rounds) console.log(r.short.padEnd(8), r.ties.map(t => t.teams.map(x => `${x.abbr}${x.goals}${t.winner === x.id ? "*" : ""}`).join("-")).join("  "));
}
