const dbus = require("./dbus");
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const cp = require('child_process');
const homeDir = require('os').homedir();
const {createCanvas} = require('canvas');
let handlers = require("./handlers.js").handlers;

Object.keys(handlers).forEach(handler => {
    handlers[handler] = require(handlers[handler]);
});

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
    config = [[{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}]];
    fs.writeFileSync(configPath, JSON.stringify(config));
} else {
    config = JSON.parse(fs.readFileSync(configPath));
}

let rawConfig = JSON.parse(JSON.stringify(config));

let buffersGenerated = false;

process.stdin.resume();

function connect() {
    let decks = StreamDeck.listStreamDecks();
    if (decks.length === 0) {
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
            cp.spawn(keyPressed.command, [], {detached: true, shell: true}).unref();
        } else if (keyPressed.hasOwnProperty("keybind") && keyPressed.keybind != null && keyPressed.keybind !== "") {
            cp.exec("xdotool key " + keyPressed.keybind);
        } else if (keyPressed.hasOwnProperty("url") && keyPressed.url != null && keyPressed.url !== "") {
            cp.exec("xdg-open " + keyPressed.url);
        } else if (keyPressed.hasOwnProperty("brightness") && keyPressed.brightness != null && keyPressed.brightness !== "") {
            myStreamDeck.setBrightness(typeof keyPressed.brightness === "string" ? parseInt(keyPressed.brightness) : keyPressed.brightness);
        } else if (keyPressed.hasOwnProperty("write") && keyPressed.write != null && keyPressed.write !== "") {
            cp.exec("xdotool type \"" + keyPressed.write + "\"");
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
        for (let handler of externalImageHandlers) {
            handler.stopLoop();
        }
        try {
            myStreamDeck = connect();
            if (myStreamDeck !== null) {
                init().then(() => {
                    connected = true;
                    attemptingConnection = false;
                    renderCurrentPage(currentPage);
                });
            } else
                attemptingConnection = false;
        } catch (e) {
            attemptingConnection = false;
        }
    }
}, 500);

function init(configChange = false) {
    if (!buffersGenerated || configChange) {
        while (externalImageHandlers.length > 0) {
            let handler = externalImageHandlers[0];
            handler.cleanup();
            externalImageHandlers.shift();
        }
        buffersGenerated = false;
        return generateBuffers();
    }
    return restartHandlers();
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
    let newConfig;
    let configDiff;
    let newRawConfig;
    switch (command) {
        case "update-config":
            newConfig = JSON.parse(arg);
            newRawConfig = JSON.parse(JSON.stringify(newConfig));
            configDiff = diffConfig(newConfig);
            config = newConfig;
            rawConfig = newRawConfig;
            setCurrentPage();
            updateBuffers(configDiff).then(() => {
                renderCurrentPage(currentPage);
            });
            return 0;
        case "reload-config":
            newConfig = JSON.parse(fs.readFileSync(configPath));
            newRawConfig = JSON.parse(JSON.stringify(newConfig));
            configDiff = diffConfig(newConfig);
            config = newConfig;
            rawConfig = newRawConfig;
            updateBuffers(configDiff).then(() => {
                renderCurrentPage(currentPage);
            });
            return config;
        case "get-details":
            return {icon_size: myStreamDeck.ICON_SIZE, rows: myStreamDeck.KEY_ROWS, cols: myStreamDeck.KEY_COLUMNS, page: currentPageIndex};
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

function diffConfig(newConfig) {
    let diff = [];
    if (JSON.stringify(newConfig) === JSON.stringify(rawConfig)) {
        for (let i = 0; i < newConfig.length; i++) {
            newConfig[i] = config[i];
        }
        return [];
    }
    for (let i = 0; i < newConfig.length; i++) {
        let diffPage = [];
        if (i >= rawConfig.length) {
            diffPage = newConfig[i];
        } else if (JSON.stringify(newConfig[i]) !== JSON.stringify(rawConfig[i])) {
            for (let j = 0; j < newConfig[i].length; j++) {
                let diffCell = {};
                if (j >= newConfig[i].length || JSON.stringify(newConfig[i][j]) !== JSON.stringify(rawConfig[i][j])) {
                    diffCell = newConfig[i][j];
                } else {
                    newConfig[i][j] = config[i][j];
                    diffCell = config[i][j];
                }
                if (config[i][j].hasOwnProperty("handler")) {
                    diffCell.handler = config[i][j].handler;
                }
                diffPage.push(diffCell);
            }
        } else {
            newConfig[i] = config[i];
        }
        diff.push(diffPage);
    }
    return diff;
}

async function renderCurrentPage(page) {
    if (page.length < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS) {
        for (let x = page.length; x < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS; x++) {
            page[x] = {};
        }
    }
    page.forEach(async (key, index) => {
        if (key.hasOwnProperty("buffer") && key.buffer) {
            setImage(key.buffer);
        } else if (!key.hasOwnProperty("icon_handler")) {
            myStreamDeck.clearKey(index);
        }

    });
}

function setImage(buffer) {
    buffer.forEach(packet => {
        myStreamDeck.device.write(packet);
    });
}

async function updateBuffers(config) {
    for (let i = 0; i < config.length; i++) {
        for (let j = 0; j < config[i].length; j++) {
            let key = config[i][j];
            if (key.hasOwnProperty("handler")) {
                key.handler.cleanup();
                delete key.handler;
            }
            if (key.hasOwnProperty("icon_handler")) {
                let handler = handlers[key.icon_handler];
                handler = new handler(i, j, generateBuffer, setConfigIcon, key);
                externalImageHandlers.push(handler);
                key.handler = handler;
                continue;
            }
            config[i][j].buffer = await generateBuffer(key.icon, key.text, j);
        }
    }
    setCurrentPage(0);
}

async function generateBuffers() {
    if (buffersGenerated)
        return;
    await updateBuffers(config);
    setCurrentPage(0);
    buffersGenerated = true;
}

async function generateBuffer(icon = __dirname + "/blank.png", text, index) {
    let image;
    if (icon === "")
        icon = __dirname + "/blank.png";
    if (typeof icon === "string")
        image = path.resolve(icon);
    else
        image = icon;
    let textSVG;
    if (text) {
        textSVG = `<svg width="72" height="72" viewBox="0 0 72 72">
        <text x="50%" y="50%" textLength="72px" transform="rotate(180 36,36)" dominant-baseline="central" text-anchor="middle" alignment-baseline="central" baseline-shift="` + ((100 - calculateFontSize(text)) / 2) + `%"
        style="width: 72px; fill:white; stroke: black; stroke-width: 0.5; font-weight: bold; font-size: `
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
    buf = await buf.flip().flop().jpeg({quality: 100, chromaSubsampling: "4:4:4"}).toBuffer();
    return myStreamDeck.generateFillImageWrites(index, buf);
}

async function restartHandlers() {
    for (let handler of externalImageHandlers) {
        handler.startLoop();
    }
}

function calculateFontSize(text) {
    let fontFamily = "16px sans-serif";
    const canvas = createCanvas(72, 72);
    const context = canvas.getContext('2d');
    context.font = fontFamily;
    let width = context.measureText(text).width;
    let size = (1 / (width / 72)) * 100;
    return size < 500 ? size > 50 ? size : 50 : 500;
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
