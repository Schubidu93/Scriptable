// Legt alle Mini-Skripte (Loader) für die Widgets in Scriptable an.
// Wird vom Mini-Skript "Installer" per Function(code)() gestartet.

const BASE = "https://raw.githubusercontent.com/Schubidu93/Scriptable/main/";

// Name in Scriptable → Skript auf GitHub, optional Strecke, Symbol und Farbe
const SCRIPTS = [
    { name: "Schnee", file: "Schnee.js", glyph: "snowflake", color: "cyan" },
    { name: "Wassertemperatur", file: "Wassertemperatur_BW.js", glyph: "tint", color: "deep-blue" },
    { name: "Marathon", file: "Marathon_GER.js", glyph: "running", color: "orange" },
    { name: "Halbmarathon", file: "Marathon_GER.js", distanz: "halbmarathon", glyph: "running", color: "purple" },
    { name: "10km", file: "Marathon_GER.js", distanz: "10km", glyph: "running", color: "green" },
    { name: "Marathon Welt", file: "Marathon_GER.js", distanz: "marathon", region: "welt", glyph: "globe-europe", color: "orange" },
    { name: "Halbmarathon Welt", file: "Marathon_GER.js", distanz: "halbmarathon", region: "welt", glyph: "globe-europe", color: "purple" },
    { name: "10km Welt", file: "Marathon_GER.js", distanz: "10km", region: "welt", glyph: "globe-europe", color: "green" },
    { name: "Radsport", file: "Radsport.js", glyph: "bicycle", color: "yellow" },
];

function loaderCode(script) {
    let run = script.region
        ? `Function("DISTANZ", "REGION", code)("${script.distanz}", "${script.region}");`
        : script.distanz
            ? `Function("DISTANZ", code)("${script.distanz}");`
            : "Function(code)();";
    return `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: ${script.color}; icon-glyph: ${script.glyph};
// Mini-Skript: lädt ${script.file} von GitHub und führt es aus
let githubURL = "${BASE}${script.file}";

let req = new Request(githubURL);
let code = await req.loadString();
${run}
`;
}

// iCloud-Ordner von Scriptable, falls aktiviert – sonst lokal
function fileManager() {
    try {
        let fm = FileManager.iCloud();
        fm.documentsDirectory();
        return fm;
    } catch (e) {
        return FileManager.local();
    }
}

async function confirmOverwrite(name) {
    let alert = new Alert();
    alert.title = `„${name}“ existiert schon`;
    alert.message = "Durch das Mini-Skript ersetzen? Eigene Änderungen daran gehen verloren.";
    alert.addAction("Ersetzen");
    alert.addCancelAction("Behalten");
    return (await alert.present()) === 0;
}

async function main() {
    let fm = fileManager();
    let dir = fm.documentsDirectory();
    let created = [], replaced = [], kept = [], same = [];

    for (let script of SCRIPTS) {
        let path = fm.joinPath(dir, `${script.name}.js`);
        let code = loaderCode(script);
        if (fm.fileExists(path)) {
            if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
                await fm.downloadFileFromiCloud(path);
            }
            if (fm.readString(path) === code) {
                same.push(script.name);
                continue;
            }
            if (!(await confirmOverwrite(script.name))) {
                kept.push(script.name);
                continue;
            }
            replaced.push(script.name);
        } else {
            created.push(script.name);
        }
        fm.writeString(path, code);
    }

    let lines = [];
    if (created.length) lines.push(`Neu: ${created.join(", ")}`);
    if (replaced.length) lines.push(`Ersetzt: ${replaced.join(", ")}`);
    if (same.length) lines.push(`Schon aktuell: ${same.join(", ")}`);
    if (kept.length) lines.push(`Behalten: ${kept.join(", ")}`);

    let done = new Alert();
    done.title = "Fertig";
    done.message = lines.join("\n");
    done.addAction("OK");
    await done.present();
    Script.complete();
}

main().catch(e => {
    console.error(e);
    Script.complete();
});
