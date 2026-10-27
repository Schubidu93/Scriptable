// Einmaliger Test: Enthält die öffentliche Kalenderseite die Wettkämpfe direkt im HTML?
const url = "https://worldathletics.org/competition/calendar-results?startDate=2026-10-26&regionId=13188422&regionType=country&disciplineId=2";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" } });
const html = await res.text();
console.log(`Status ${res.status}, ${html.length} Zeichen`);
console.log(`Titel: ${(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]}`);
console.log(`Tabellenzeilen: ${(html.match(/<tr/gi) || []).length}, Tabellen: ${(html.match(/<table/gi) || []).length}`);
const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const word of ["Marathon", "Lauf", "Halbmarathon", "10 km", "Label", "Category", "Kategorie"]) {
    const i = text.indexOf(word);
    console.log(`Text "${word}": ${i >= 0 ? text.slice(Math.max(0, i - 150), i + 250) : "–"}`);
}
const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
console.log(`Eingebettete Seitendaten (__NEXT_DATA__): ${next ? next[1].length + " Zeichen: " + next[1].slice(0, 1500) : "keine"}`);
