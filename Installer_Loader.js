// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: download;
// Mini-Skript: lädt Installer.js von GitHub und legt alle Widget-Skripte an
let githubURL = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/Installer.js";

let req = new Request(githubURL);
let code = await req.loadString();
Function(code)();
