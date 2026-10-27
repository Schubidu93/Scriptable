// Mini-Skript für Scriptable: lädt Marathon_GER.js von GitHub und zeigt die Strecke "10km"
let githubURL = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/Marathon_GER.js";

let req = new Request(githubURL);
let code = await req.loadString();
Function("DISTANZ", code)("10km");
