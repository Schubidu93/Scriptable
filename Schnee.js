(async () => {
    let widget = new ListWidget();
    widget.backgroundColor = new Color("#4682B4"); // Hellblau für den Hintergrund

    let url = "https://www.hnd.bayern.de/schnee/inn/muenchen-stadt-10865";
    let html = await new Request(url).loadString();
    
    let regex = /Schneehöhe vom .* Uhr: <b>(\d+)<\/b> cm/;
    let match = regex.exec(html);
    
    if (match) {
        let snowHeight = parseInt(match[1]);

        // Schnee Emoji und Schneeflocke Emoji
        let snowflakeEmoji = "❄️";
        let snowmanEmoji = "⛄️";

        // Stecknadel-Emoji Unicode
        let pinEmoji = "\uD83D\uDCCD"; 

        
        let locationText = widget.addText(`${pinEmoji} München`); // Ortsname über der Zahl
        locationText.font = Font.regularSystemFont(12); // Kleinere Schriftgröße für den Ortsnamen
        locationText.leftAlignText(); // Text linksbündig
        locationText.textColor = Color.white(); // Schwarzer Text

        let textStack = widget.addStack();

let snowHeightText = textStack.addText(snowHeight.toString()); // Schneehöhe als Zahl ohne "cm"
snowHeightText.font = Font.regularSystemFont(44); // Mittlere Schriftgröße für die Schneehöhe
snowHeightText.textColor = Color.white(); // Schwarzer Text

let cmText = textStack.addText(" cm"); // "cm" Text
cmText.font = Font.regularSystemFont(14); // Kleine Schriftgröße für "cm"
cmText.textColor = Color.white(); // Schwarzer Text

    
        
        widget.addSpacer(20); // Größerer Zeilenabstand

        let snowInfoText = widget.addText(`Schneehöhe`); // Schneehöhe Info mit Emojis
        snowInfoText.font = Font.regularSystemFont(12); // Kleine Schriftgröße für die Schneehöhe Info
        snowInfoText.leftAlignText(); // Text linksbündig
        snowInfoText.textColor = Color.white(); // Schwarzer Text

        let Extratext = widget.addText(`${snowflakeEmoji} ${snowmanEmoji}`); // Schneehöhe Info mit Emojis
        Extratext.font = Font.regularSystemFont(24); // Kleine Schriftgröße für die Schneehöhe Info
        Extratext.leftAlignText(); // Text linksbündig
        Extratext.textColor = Color.white(); // Schwarzer Text
    } else {
        let text = "Es liegt kein Schnee oder die Daten konnten nicht abgerufen werden.";
        let textItem = widget.addText(text);
        textItem.font = Font.regularSystemFont(20); // Schriftgröße erhöht
        textItem.centerAlignText(); // Text zentrieren
        textItem.textColor = Color.white(); // Schwarzer Text
    }

    Script.setWidget(widget);
    Script.complete();
})();
