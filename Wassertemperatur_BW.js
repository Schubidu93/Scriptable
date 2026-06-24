(async () => {
    // URLs der Webseiten mit den Wassertemperaturen
    const urlObersee = 'https://www.wetteronline.de/wassertemperatur-badeseen/baden-wuerttemberg';
    const urlMuenchen = 'https://www.gkd.bayern.de/de/fluesse/wassertemperatur/kelheim/muenchen-himmelreichbruecke-16515005/messwerte';
    const urlFeringasee = 'https://xn--wasserwacht-unterfhring-plc.de/feringasee/';

    // Funktion zum Laden und Parsen der Wassertemperatur von Obersee/Kißlegg
async function fetchWaterTemperatureObersee() {
    const req = new Request(urlObersee);
    const html = await req.loadString();

    const regex = /Obersee\/Kißlegg[\s\S]*?<td class="ttcol">\s*(\d+)\s*&deg;C/i;
    const match = html.match(regex);

    if (match && match[1]) {
        return parseFloat(match[1]);
    } else {
        return null;
    }
}

    // Funktion zum Laden und Parsen der Wassertemperatur von München Himmelreichbrücke
    async function fetchWaterTemperatureMuenchen() {
        const req = new Request(urlMuenchen);
        const html = await req.loadString();
        
        const regex = /<td\s+class="center">(\d+,\d+)<\/td>/;
        const match = html.match(regex);

        if (match && match.length > 1) {
            return parseFloat(match[1].replace(',', '.'));
        } else {
            return null;
        }
    }

   // Funktion zum Laden und Parsen der Wassertemperatur von Feringasee
async function fetchWaterTemperatureFeringasee() {
    const req = new Request(urlFeringasee);
    const html = await req.loadString();

    const regex = /<b>(\d+\.\d+)<\/b>\s*Grad Celius im Wasser/i;
    const match = html.match(regex);

    if (match && match[1]) {
        return Math.round(parseFloat(match[1]) * 10) / 10;
    } else {
        return null;
    }
}

    // Funktion zur Erstellung der Temperaturanzeige
    function createTemperatureDisplay(location, temperature, stack) {
        let row = stack.addStack();
        row.layoutHorizontally();
        
        let locationText = row.addText(location);
        locationText.textColor = Color.white();
        locationText.font = Font.regularSystemFont(12); // Schriftgröße der Ortsnamen leicht reduzieren
        locationText.leftAlignText();
        
        row.addSpacer();
        
        let tempText = row.addText(temperature !== null ? `${temperature.toFixed(1)}°` : 'N/A');
        tempText.textColor = Color.white();
        tempText.font = Font.systemFont(20);
        tempText.rightAlignText();
    }

    // Hauptfunktion zur Erstellung des Widgets
    async function createWidget() {
        const tempObersee = await fetchWaterTemperatureObersee();
        const tempMuenchen = await fetchWaterTemperatureMuenchen();
        const tempFeringasee = await fetchWaterTemperatureFeringasee();
        
        let widget = new ListWidget();
        widget.backgroundColor = new Color("#4682B4"); // Hintergrundfarbe setzen
        
        // Titel
        let titleStack = widget.addStack();
        let title = titleStack.addText('Wasser');
        title.textColor = Color.white();
        title.font = Font.regularSystemFont(14); // Schriftgröße des Titels auf 14 setzen
        titleStack.addSpacer();
        widget.addSpacer(4);
        
        // Temperaturen
        let tempStack = widget.addStack();
        tempStack.layoutVertically();
        
        createTemperatureDisplay('Obersee', tempObersee, tempStack);
        widget.addSpacer(2);
        createTemperatureDisplay('Eisbach', tempMuenchen, tempStack);
        widget.addSpacer(2);
        createTemperatureDisplay('Feringasee', tempFeringasee, tempStack);
        
        return widget;
    }

    // Widget erstellen und anzeigen
    let widget = await createWidget();
    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        widget.presentSmall();
    }
    Script.complete();
})();
