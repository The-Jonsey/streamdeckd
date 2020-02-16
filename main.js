const dbus = require("./dbus");
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const cp = require('child_process');
const homeDir = require('os').homedir();
const {createCanvas} = require('canvas');
const usbDetect = require("usb-detection");
let handlers = require("./handlers.json");

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
    config = {handlers: {}, pages: [[{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}]]};
    fs.writeFileSync(configPath, JSON.stringify(config));
} else {
    config = JSON.parse(fs.readFileSync(configPath).toString());
    if (config instanceof Array) {
        config = {handlers: {}, pages: config};
        fs.writeFileSync(configPath, JSON.stringify(config));
    }
}

if (config.hasOwnProperty("handlers")) {
    handlers = {...handlers, ...config.handlers}
}

Object.keys(handlers).forEach(handler => {
    handlers[handler].import = require(handlers[handler].script_path);
});

let rawConfig = JSON.parse(JSON.stringify(config));

let buffersGenerated = false;

let interval;

usbDetect.startMonitoring();

process.stdin.resume();

usbDetect.on("add:4057", async () => {
    await attemptConnection();
});

function registerReconnectInterval() {
    if (!interval)
        interval = setInterval(async () => {
            console.log("Interval");
            if (!connected && !attemptingConnection) {
                if (await attemptConnection()) {
                    clearInterval(interval);
                    interval = undefined;
                }
            } else if (connected) {
                clearInterval(interval);
                interval = undefined;
            }
        }, 500);
}

async function attemptConnection() {
    console.log("Attempt");
    attemptingConnection = true;
    console.log("Attempting Connection");
    for (let handler of externalImageHandlers) {
        if (handler.hasOwnProperty("stopLoop"))
            handler.stopLoop();
    }
    try {
        let decks = StreamDeck.listStreamDecks();
        if (decks.length === 0) {
            myStreamDeck = null;
        } else {
            myStreamDeck = StreamDeck.openStreamDeck(decks[0].path);
            registerEventListeners(myStreamDeck);
        }
        if (myStreamDeck !== null) {
            if (!buffersGenerated) {
                while (externalImageHandlers.length > 0) {
                    let handler = externalImageHandlers[0];
                    if (handler.hasOwnProperty("cleanup"))
                        handler.cleanup();
                    externalImageHandlers.shift();
                }
                buffersGenerated = false;
                await generateBuffers();
            }
            await restartHandlers();
            connected = true;
            attemptingConnection = false;
            renderCurrentPage(currentPage);
            return true;
        } else {
            attemptingConnection = false;
            return false;
        }
    } catch (e) {
        attemptingConnection = false;
        return false;
    }
}

function registerEventListeners(myStreamDeck) {
    if (config.hasOwnProperty("brightness"))
        myStreamDeck.setBrightness(config.brightness);
    myStreamDeck.on('up', async keyIndex => {
        let keyPressed = currentPage[keyIndex];
        if (keyPressed === undefined)
            return;
        if (keyPressed.hasOwnProperty("switch_page") && keyPressed.switch_page != null && keyPressed.switch_page > 0) {
            await setCurrentPage(keyPressed.switch_page - 1);
            dbus.updatePage(keyPressed.switch_page - 1);
        }
        if (keyPressed.hasOwnProperty("command") && keyPressed.command != null && keyPressed.command !== "") {
            cp.spawn(keyPressed.command, [], {detached: true, shell: true}).unref();
        }
        if (keyPressed.hasOwnProperty("keybind") && keyPressed.keybind != null && keyPressed.keybind !== "") {
            cp.exec("xdotool key " + keyPressed.keybind);
        }
        if (keyPressed.hasOwnProperty("url") && keyPressed.url != null && keyPressed.url !== "") {
            cp.exec("xdg-open " + keyPressed.url);
        }
        if (keyPressed.hasOwnProperty("brightness") && keyPressed.brightness != null && keyPressed.brightness !== "") {
            myStreamDeck.setBrightness(typeof keyPressed.brightness === "string" ? parseInt(keyPressed.brightness) : keyPressed.brightness);
        }
        if (keyPressed.hasOwnProperty("write") && keyPressed.write != null && keyPressed.write !== "") {
            cp.exec("xdotool type \"" + keyPressed.write + "\"");
        }
        if (keyPressed.hasOwnProperty("key_handler")) {
            handlers[keyPressed.key_handler].import.key(currentPageIndex, keyIndex, keyPressed);
        }
    });
    myStreamDeck.on("error", () => {
        myStreamDeck.close();
        for (let handler of externalImageHandlers) {
            if (handler.hasOwnProperty("stopLoop"))
                handler.stopLoop();
        }
        setTimeout(() => {
            usbDetect.find(4057, function (err, devices) {
                if (devices.length > 0)
                    registerReconnectInterval();
            });
        }, 1500);
        connected = false;
    });
}

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, (() => {
        if (connected) {
            try {
                myStreamDeck.resetToLogo();
            } catch (e) {

            }
            myStreamDeck.close();
        }
        process.exit(0);
    }).bind(null, eventType));
});

function diffConfig(newConfig) {
    let diff = [];
    if (JSON.stringify(newConfig) === JSON.stringify(rawConfig)) {
        for (let i = 0; i < newConfig.length; i++) {
            newConfig[i] = config.pages[i];
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
                    newConfig[i][j] = config.pages[i][j];
                    diffCell = config.pages[i][j];
                }
                if (config.pages[i][j].hasOwnProperty("iconHandler")) {
                    diffCell.iconHandler = config.pages[i][j].iconHandler;
                }
                diffPage.push(diffCell);
            }
        } else {
            newConfig[i] = config.pages[i];
        }
        diff.push(diffPage);
    }
    return diff;
}

function renderCurrentPage(page) {
    if (page.length < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS) {
        for (let x = page.length; x < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS; x++) {
            page[x] = {};
        }
    }
    for (let key of page) {
        if (key.hasOwnProperty("buffer") && key.buffer) {
            setImage(key.buffer);
        }
    }
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
            if (key.hasOwnProperty("iconHandler")) {
                key.iconHandler.cleanup();
                delete key.iconHandler;
            }
            if (key.hasOwnProperty("icon_handler")) {
                let handler = handlers[key.icon_handler].import.icon;
                handler = new handler(i, j, generateBuffer, setConfigIcon, key);
                externalImageHandlers.push(handler);
                key.iconHandler = handler;
                continue;
            }
            config[i][j].buffer = await generateBuffer(key.icon, key.text, j);
        }
    }
    await setCurrentPage(0);
}

async function generateBuffers() {
    if (buffersGenerated)
        return;
    await updateBuffers(config.pages);
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
        <text x="50%" y="50%" textLength="72px" transform="rotate(180 36,36)" dominant-baseline="central"
        text-anchor="middle" alignment-baseline="central" baseline-shift="` + ((100 - calculateFontSize(text)) / 2) + `%"
        style="width: 72px; fill:white; stroke: black; stroke-width: 0.5; font-weight: bold; font-size: `
            + calculateFontSize(text) + `%; font-family: sans-serif">` + text + `</text></svg>`;
    }
    // noinspection JSUnresolvedFunction
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
        if (!handler.interval && handler.hasOwnProperty("startLoop"))
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

async function setCurrentPage(i = 0) {
    currentPageIndex = i;
    currentPage = config.pages[currentPageIndex];
    renderCurrentPage(currentPage);
}

function setConfigIcon(page, index, buffer) {
    config.pages[page][index].buffer = buffer;
    if (connected && page === currentPageIndex) {
        setImage(buffer);
    }
}

registerReconnectInterval();

dbus.init(rawConfig, async (command, arg) => {
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
            await updateBuffers(configDiff);
            return 0;
        case "reload-config":
            newConfig = JSON.parse(fs.readFileSync(configPath).toString());
            newRawConfig = JSON.parse(JSON.stringify(newConfig));
            configDiff = diffConfig(newConfig);
            config = newConfig;
            rawConfig = newRawConfig;
            await updateBuffers(configDiff);
            return config;
        case "get-details":
            return {
                icon_size: myStreamDeck.ICON_SIZE,
                rows: myStreamDeck.KEY_ROWS,
                cols: myStreamDeck.KEY_COLUMNS,
                page: currentPageIndex
            };
        case "set-page":
            await setCurrentPage(arg);
            return 0;
        case "commit-config":
            fs.writeFileSync(configPath, JSON.stringify(rawConfig));
            return 0;
        default:
            return;
    }
});

class DBusClient {
    constructor() {

    }

    async updateConfig(newConfig) {
        newConfig = JSON.parse(arg);
        let newRawConfig = JSON.parse(JSON.stringify(newConfig));
        let configDiff = diffConfig(newConfig);
        config = newConfig;
        rawConfig = newRawConfig;
        await updateBuffers(configDiff);
        return 0;
    }

    async reloadConfig() {
        let newConfig = JSON.parse(fs.readFileSync(configPath).toString());
        let newRawConfig = JSON.parse(JSON.stringify(newConfig));
        let configDiff = diffConfig(newConfig);
        config = newConfig;
        rawConfig = newRawConfig;
        await updateBuffers(configDiff);
        return config;
    }

    getConfig() {
        return {
            icon_size: myStreamDeck.ICON_SIZE,
            rows: myStreamDeck.KEY_ROWS,
            cols: myStreamDeck.KEY_COLUMNS,
            page: currentPageIndex
        };
    }

    async setPage() {
        await setCurrentPage(arg);
        return 0;
    }

    commitConfig() {
        fs.writeFileSync(configPath, JSON.stringify(rawConfig));
        return 0;
    }
}
