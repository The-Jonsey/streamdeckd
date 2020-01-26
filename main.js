const dbus = require("./dbus");
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const {exec, spawn} = require('child_process');
const homeDir = require('os').homedir();
const {createCanvas} = require('canvas');

process.title = "streamdeckd";

let connected = false;

let attemptingConnection = false;

let myStreamDeck;

let currentPageIndex = -1;

let currentPage;

const configPath = path.resolve(homeDir, ".streamdeck-config.json");

let config;

let externalImageHandlers = [];

if (!fs.existsSync(configPath)) {
    config = [[]];
    fs.writeFileSync(configPath, JSON.stringify(config));
} else {
    config = JSON.parse(fs.readFileSync(configPath));
}

let rawConfig = JSON.parse(JSON.stringify(config));

process.stdin.resume();

function connect() {
    let decks = StreamDeck.listStreamDecks();
    if(decks.length === 0) {
        return null;
    }
    let myStreamDeck = StreamDeck.openStreamDeck(decks[0].path);
    registerEventListeners(myStreamDeck);
    return myStreamDeck;
}

function registerEventListeners(myStreamDeck) {
    myStreamDeck.on('up', keyIndex => {
        let keyPressed = currentPage[keyIndex];
        if (keyPressed === undefined)
            return;
        if (keyPressed.hasOwnProperty("switch_page") && keyPressed.switch_page != null && keyPressed.switch_page > 0) {
            setCurrentPage(keyPressed.switch_page - 1);
            renderCurrentPage(currentPage);
            dbus.updatePage(keyPressed.switch_page - 1);
        } else if (keyPressed.hasOwnProperty("command") && keyPressed.command != null && keyPressed.command !== "") {
            spawn(keyPressed.command, [], {detached: true});
        } else if (keyPressed.hasOwnProperty("keybind") && keyPressed.keybind != null && keyPressed.keybind !== "") {
            exec("xdotool key " + keyPressed.keybind);
        } else if (keyPressed.hasOwnProperty("url") && keyPressed.url != null && keyPressed.url !== "") {
            exec("xdg-open " + keyPressed.url);
        } else if (keyPressed.hasOwnProperty("brightness") && keyPressed.brightness != null && keyPressed.brightness !== "") {
            myStreamDeck.setBrightness(typeof keyPressed.brightness === "string" ? parseInt(keyPressed.brightness) : keyPressed.brightness);
        } else if (keyPressed.hasOwnProperty("write") && keyPressed.write != null && keyPressed.write !== "") {
            exec("xdotool type \"" + keyPressed.write + "\"");
        }
    });
    myStreamDeck.on("error", (err) => {
        myStreamDeck.close();
        connected = false;
    });
}

setInterval(() => {
    if (!connected && !attemptingConnection) {
        attemptingConnection = true;
        console.log("Attempting Connection");
        while (externalImageHandlers.length > 0) {
            let handler = externalImageHandlers[0];
            handler.cleanup();
            externalImageHandlers.shift();
        }
        try {
            myStreamDeck = connect();
            if (myStreamDeck !== null)
                init().then(() => {
                    connected = true;
                    attemptingConnection = false;
                    renderCurrentPage(currentPage);
                });
            else
                attemptingConnection = false;
        } catch (e) {
            attemptingConnection = false;
        }
    }
}, 500);

function init() {
    return generateBuffers();
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, cleanUpServer.bind(null, eventType));
});

function cleanUpServer() {
    if (connected) {
        try {
            myStreamDeck.resetToLogo();
        } catch (e) {

        }
        myStreamDeck.close();
    }
    process.exit(0);
}

dbus.init(rawConfig, (command, arg) => {
    switch (command) {
        case "update-config":
            config = JSON.parse(arg);
            setCurrentPage();
            init().then(() => {
                renderCurrentPage(currentPage);
            });
            return 0;
        case "reload-config":
            config = JSON.parse(fs.readFileSync(configPath));
            setCurrentPage();
            init().then(() => {
                renderCurrentPage(currentPage);
            });
            return config;
        case "get-details":
            return {icon_size: myStreamDeck.ICON_SIZE, rows: myStreamDeck.KEY_ROWS, cols: myStreamDeck.KEY_COLUMNS};
        case "set-page":
            setCurrentPage(arg);
            renderCurrentPage(currentPage);
            return 0;
        case "commit-config":
            fs.writeFileSync(configPath, JSON.stringify(config));
            return 0;
        default:
            return;
    }
});

async function renderCurrentPage(page) {
    if (page.length < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS) {
        for (let x = page.length; x < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS; x++) {
            page[x] = {};
        }
    }
    page.forEach(async (key, index) => {
        if (key.hasOwnProperty("buffer")) {
            setImage(key.buffer);
        } else {
            myStreamDeck.clearKey(index);
        }

    });
}

function setImage(buffer) {
    buffer.forEach(packet => {
        myStreamDeck.device.write(packet);
    });
}

async function generateBuffers() {
    for (let i = 0; i < config.length; i++) {
        for (let j = 0; j < config[i].length; j++) {
            let key = config[i][j];
            if (key.icon_handler) {
                let handler = require(key.icon_handler);
                externalImageHandlers.push(handler);
                handler.init(i, key, j);
                continue;
            }
            config[i][j].buffer = await generateBuffer(key.icon, key.text, j);
        }
    }
    setCurrentPage(0);
}

async function generateBuffer(icon = __dirname + "/blank.png", text, index) {
    let image;
    if (typeof icon === "string")
        image = path.resolve(icon);
    else
        image = icon;
    let textSVG;
    if (text) {
        textSVG = `<svg width="72px" height="72px" viewBox="0 0 72 72">
        <text x="50%" y="50%" transform="rotate(180 36,36)" dominant-baseline="middle" text-anchor="middle"
        style="fill:white; stroke: black; stroke-width: 0.5; font-weight: bold; font-size: `
            + calculateFontSize(text) + `%; font-family: sans-serif">` + text + `</text>
        </svg>`;
    }
    let buf = await sharp(image)
        .flatten()
        .resize(72, 72);
    if (text) {
        buf = await buf.composite([{
            input: Buffer.from(textSVG),
        }]);
    }
    buf = await buf.flip().flop().jpeg().toBuffer();
    return myStreamDeck.generateFillImageWrites(index, buf);
}

function calculateFontSize(text) {
    let fontFamily = "16px sans-serif";
    const canvas = createCanvas(72, 72);
    const context = canvas.getContext('2d');
    context.font = fontFamily;
    let width = context.measureText(text).width;
    return (1 / (width / 72)) * 100;
}

function setCurrentPage(i = 0) {
    currentPageIndex = i;
    currentPage = config[currentPageIndex];
}

function setConfigIcon(page, index, buffer) {
    config[page][index].buffer = buffer;
    if (connected && page === currentPageIndex) {
        setImage(buffer);
    }
}


module.exports = {
    generateBuffer,
    setConfigIcon
};
