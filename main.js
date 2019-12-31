const dbus = require("./dbus");
const path = require('path');
const sharp = require('sharp');
const textToImage = require('text-to-image');
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const exec = require('child_process').exec;
const homeDir = require('os').homedir();
console.log(StreamDeck);

connected = false;

let myStreamDeck;

const configPath = path.resolve(homeDir, ".streamdeck-config.json");

let config = JSON.parse(fs.readFileSync(configPath));

let rawConfig = JSON.parse(JSON.stringify(config));

dbus(rawConfig, configPath, (newConfig) => {
    console.log(newConfig);
    config = JSON.parse(newConfig);
    currentPage = config[0];
    init().then(() => {
        renderCurrentPage(currentPage);
    });
    return 0;
});

let currentPage = config[0];

function init() {
    return generateBuffers();
}

async function renderCurrentPage(page) {
    myStreamDeck.clearAllKeys();
    for (let i = 0; i < myStreamDeck.NUM_KEYS; i++) {
        if (i >= page.length) {
            break;
        }
        let key = page[i];
        if (key.hasOwnProperty("buffer")) {
            myStreamDeck.fillImage(i, key.buffer);
        }
    }
    page.forEach((key, index) => {
        if (key.hasOwnProperty("buffer")) {
            myStreamDeck.fillImage(index, key.buffer);
        } else {
            myStreamDeck.clearKey(index);
        }

    });
}

async function generateBuffers() {
    for (let i = 0; i < config.length; i++) {
        for (let j = 0; j < config[i].length; j++) {
            let key = config[i][j];
            if (key.hasOwnProperty("icon") && key.icon !== "") {
                config[i][j].buffer = await generateBuffer(key);
            }
            if (key.hasOwnProperty("text") && key.text !== "") {
                let dataurl = await textToImage.generate(key.text, {
                    maxWidth: myStreamDeck.ICON_SIZE,
                    customWidth: myStreamDeck.ICON_SIZE,
                    customHeight: myStreamDeck.ICON_SIZE,
                    fontSize: 16,
                    bgColor: "black",
                    textColor: "white"
                });
                key.icon_buffer = new Buffer(dataurl.split(",")[1], "base64");
                config[i][j].buffer = await generateBuffer(key);
            }
        }
    }
}

async function generateBuffer(key) {
    let image;
    if (key.hasOwnProperty("icon_buffer")) {
        image = key.icon_buffer
    } else {
        image = path.resolve(key.icon);
    }
    return sharp(image)
        .flatten()
        .resize(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE) // Scale up/down to the right size, cropping if necessary.
        .raw() // Give us uncompressed RGB.
        .toBuffer();
}

process.stdin.resume();

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, cleanUpServer.bind(null, eventType));
})

function cleanUpServer() {
    myStreamDeck.resetToLogo();
    myStreamDeck.close();
    process.exit(0);
}

function connect() {
    let myStreamDeck = StreamDeck.openStreamDeck();
    connected = true;
    registerEventListeners(myStreamDeck);
    return myStreamDeck;
}


function registerEventListeners(myStreamDeck) {
    myStreamDeck.on('down', keyIndex => {
        let keyPressed = currentPage[keyIndex];
        if (keyPressed === undefined)
            return;
        if (keyPressed.hasOwnProperty("switch_page") && keyPressed.switch_page != null && keyPressed.switch_page > 0) {
            currentPage = config[keyPressed.switch_page - 1];
            renderCurrentPage(currentPage);
        } else if (keyPressed.hasOwnProperty("command") && keyPressed.command != null && keyPressed.command !== "") {
            exec(keyPressed.command);
        } else if (keyPressed.hasOwnProperty("keybind") && keyPressed.keybind != null && keyPressed.keybind !== "") {
            exec("xdotool key " + keyPressed.keybind);
        } else if (keyPressed.hasOwnProperty("url") && keyPressed.url != null && keyPressed.url !== "") {
            exec("xdg-open http://" + keyPressed.url);
        }
    });
    myStreamDeck.on("error", error => {
        myStreamDeck.close();
        connected = false;
    });
}

setInterval(() => {
    if (!connected) {
        console.log("Attempting Connection");
        try {
            myStreamDeck = connect();
            init().then(() => {
                renderCurrentPage(currentPage);
            })
        } catch (e) {

        }
    }
}, 1000);