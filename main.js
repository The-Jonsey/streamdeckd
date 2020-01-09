const dbus = require("./dbus");
const path = require('path');
const sharp = require('sharp');
const textToImage = require('text-to-image');
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const exec = require('child_process').exec;
const homeDir = require('os').homedir();

process.title = "streamdeckd";

let connected = false;

let myStreamDeck;

const configPath = path.resolve(homeDir, ".streamdeck-config.json");

let config;

if (!fs.existsSync(configPath)) {
    config = [[]];
    fs.writeFileSync(configPath, JSON.stringify(config));
} else {
    config = JSON.parse(fs.readFileSync(configPath));
}

let rawConfig = JSON.parse(JSON.stringify(config));

dbus.init(rawConfig, (command, arg) => {
    switch (command) {
        case "update-config":
            config = JSON.parse(arg);
            currentPage = config[0];
            init().then(() => {
                renderCurrentPage(currentPage);
            });
            return 0;
        case "reload-config":
            config = JSON.parse(fs.readFileSync(configPath));
            currentPage = config[0];
            init().then(() => {
                renderCurrentPage(currentPage);
            });
            return config;
        case "get-details":
            return {icon_size: myStreamDeck.ICON_SIZE, rows: myStreamDeck.KEY_ROWS, cols: myStreamDeck.KEY_COLUMNS};
        case "set-page":
            currentPage = config[arg];
            renderCurrentPage(currentPage);
            return 0;
        case "commit-config":
            fs.writeFileSync(configPath, JSON.stringify(config));
            return 0;
        default:
            return;
    }
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
    if (connected) {
        myStreamDeck.resetToLogo();
        myStreamDeck.close();
    }
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
            dbus.updatePage(keyPressed.switch_page - 1);
        } else if (keyPressed.hasOwnProperty("command") && keyPressed.command != null && keyPressed.command !== "") {
            exec(keyPressed.command);
        } else if (keyPressed.hasOwnProperty("keybind") && keyPressed.keybind != null && keyPressed.keybind !== "") {
            exec("xdotool key " + keyPressed.keybind);
        } else if (keyPressed.hasOwnProperty("url") && keyPressed.url != null && keyPressed.url !== "") {
            exec("xdg-open " + keyPressed.url);
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
