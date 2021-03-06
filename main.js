const path = require('path');
const jimp = require('jimp');
const svg2img = require("svg2img");
const fs = require('fs');
const StreamDeck = require('elgato-stream-deck');
const cp = require('child_process');
const homeDir = require('os').homedir();
try {
    const compileRequires = require("./compile-requires.js");
} catch (e) {

}
const usbDetect = require("usb-detection");
let handlers = require("./handlers.json");
let dbus = require("./dbus.js");
const createCanvas = require("canvas").createCanvas;
handlers.Spotify.import = require("./spotify-handler.js");
handlers.Gif.import = require("./gif-handler.js");
handlers.Time.import = require("./time-handler.js");

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
    Object.keys(config.handlers).forEach(handler => {
        config.handlers[handler].import = require(config.handlers[handler].script_path);
    });
    handlers = {...config.handlers, ...handlers}
}

let rawConfig = JSON.parse(JSON.stringify(config));

rawConfig.handlers = handlers;

let buffersGenerated = false;

let interval;

usbDetect.startMonitoring();

//process.stdin.resume();

usbDetect.on("add:4057", async () => {
    await attemptConnection();
});

function registerReconnectInterval() {
    if (!interval)
        interval = setInterval(async () => {
            log("Interval");
            if (connected) {
                clearInterval(interval);
                interval = undefined;
            } else if (!attemptingConnection) {
                if (await attemptConnection()) {
                    clearInterval(interval);
                    interval = undefined;
                }
            }
        }, 1500);
}

async function attemptConnection() {
    log("Attempt");
    attemptingConnection = true;
    log("Attempting Connection");
    for (let handler of externalImageHandlers) {
        if (handler.hasOwnProperty("stopLoop"))
            handler.stopLoop();
    }
    try {
        let decks = StreamDeck.listStreamDecks();
        if (decks.length === 0) {
            log("No decks found");
            myStreamDeck = null;
        } else {
            myStreamDeck = StreamDeck.openStreamDeck(decks[0].path);
            log("Connecting to: " + JSON.stringify(decks[0]));
            log(myStreamDeck.getFirmwareVersion());
            registerEventListeners(myStreamDeck);
        }
        if (myStreamDeck !== null) {
            log("myStreamDeck connected");
            if (!buffersGenerated) {
                while (externalImageHandlers.length > 0) {
                    log("Clearing external handlers");
                    let handler = externalImageHandlers[0];
                    if (handler.hasOwnProperty("cleanup"))
                        handler.cleanup();
                    externalImageHandlers.shift();
                }
                buffersGenerated = false;
                log("Generating buffers");
                await generateBuffers();
            }
            log("Restarting handlers");
            await restartHandlers();
            connected = true;
            attemptingConnection = false;
            log("Setting current page");
            renderCurrentPage(currentPage);
            return true;
        } else {
            log("myStreamDeck was null");
            attemptingConnection = false;
            return false;
        }
    } catch (e) {
        attemptingConnection = false;
        log(e);
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
    myStreamDeck.on("error", (e) => {
        log(e);
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

[`SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, ((e) => {
        log(e);
        if (connected) {
            try {
                myStreamDeck.resetToLogo();
            } catch (e) {

            }
            myStreamDeck.close();
        }
        usbDetect.stopMonitoring();
        connected = true;
        process.exit(0);
    }).bind(null, eventType));
});

function diffConfig(newConfig) {
    let diff = [];
    if (JSON.stringify(newConfig) === JSON.stringify(rawConfig)) {
        for (let i = 0; i < newConfig.pages.length; i++) {
            newConfig.pages[i] = config.pages[i];
        }
        return [];
    }
    for (let i = 0; i < newConfig.pages.length; i++) {
        let diffPage = [];
        if (i === 7)
            console.log(i);
        if (i >= rawConfig.pages.length) {
            diffPage = newConfig.pages[i];
        } else if (JSON.stringify(newConfig.pages[i]) !== JSON.stringify(rawConfig.pages[i])) {
            for (let j = 0; j < newConfig.pages[i].length; j++) {
                let diffCell = {};
                if (j >= newConfig.pages[i].length || JSON.stringify(newConfig.pages[i][j]) !== JSON.stringify(rawConfig.pages[i][j])) {
                    diffCell = newConfig.pages[i][j];
                } else {
                    newConfig.pages[i][j] = config.pages[i][j];
                    diffCell = config.pages[i][j];
                }
                if (config.pages[i][j].hasOwnProperty("iconHandler")) {
                    diffCell.iconHandler = config.pages[i][j].iconHandler;
                }
                diffPage.push(diffCell);
            }
        } else {
            newConfig.pages[i] = config.pages[i];
        }
        diff.push(diffPage);
    }
    return diff;
}

function renderCurrentPage(page) {
    log("Rendering: " + currentPageIndex);
    if (page.length < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS) {
        for (let x = page.length; x < myStreamDeck.KEY_ROWS * myStreamDeck.KEY_COLUMNS; x++) {
            page[x] = {};
        }
    }
    for (let x = 0; x < page.length; x++) {
        let key = page[x];
        log("Rendering: " + currentPageIndex + ":" + x);
        if (key.hasOwnProperty("buffer") && key.buffer) {
            //myStreamDeck.fillImage(x, key.buffer);
            setImage(x, key.buffer);
        }
    }
}

function setImage(key, buffer) {
    buffer.forEach(packet => {
        myStreamDeck.device.write(packet);
    });
}

async function updateBuffers(config) {
    for (let i = 0; i < config.length; i++) {
        for (let j = 0; j < config[i].length; j++) {
            try {
                let key = config[i][j];
                if (key.hasOwnProperty("iconHandler")) {
                    if (key.iconHandler.cleanup)
                        key.iconHandler.cleanup();
                    delete key.iconHandler;
                }
                if (key.hasOwnProperty("icon_handler")) {
                    let handler = handlers[key.icon_handler].import.icon;
                    handler = new handler(i, myStreamDeck.transformKeyIndex(j), generateBuffer, setConfigIcon, key);
                    externalImageHandlers.push(handler);
                    key.iconHandler = handler;
                    continue;
                }
                log("Generating buffer for " + i + ":" + j);
                config[i][j].buffer = await generateBuffer(key.icon, key.text, myStreamDeck.transformKeyIndex(j));
            } catch (e) {
                log(e);
            }
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

async function generateBuffer(icon = path.join(__dirname, "blank.png"), text, index) {
    let image;
    if (icon === "")
        icon = __dirname + "/blank.png";
    if (typeof icon === "string") {
        image = path.resolve(icon);
        log("Loading: " + icon);
    } else
        image = icon;
    let textSVG;
    if (text) {
        log("Generating svg for: " + text);
        if (text.toString() === "0") {
            log("Here");
        }
        textSVG = `<svg width="${myStreamDeck.ICON_SIZE}" height="${myStreamDeck.ICON_SIZE}" viewBox="0 0 ${myStreamDeck.ICON_SIZE} ${myStreamDeck.ICON_SIZE}">
        <text x="50%" y="50%" textLength="${myStreamDeck.ICON_SIZE}px" transform="rotate(180 36,36)" dominant-baseline="central"
        text-anchor="middle" alignment-baseline="central" baseline-shift="` + (8 * (calculateFontSize(text) / 100)) * -1 + `%"
        style="width: ${myStreamDeck.ICON_SIZE}px; fill:white; stroke: black; stroke-width: 0.5; font-weight: bold; font-size: `
            + calculateFontSize(text) *0.12 + `px; font-family: sans-serif">` + text + `</text></svg>`;
    }
    log("Reading image");
    try {
        let buf = await jimp.read(image);
        buf.contain(72, 72).quality(100);
        log("Resizing image");
        if (text) {
            let textBuf = await svgtoimg(textSVG);
            try {
                textBuf = await jimp.read(textBuf);
            } catch (e) {
                log(e);
            }
            textBuf.contain(72, 72).quality(100)
                .flip(false, true)
                .flip(true, false);
            buf.composite(textBuf, 0, 0);
        }
        log("Flipping image");
        buf.flip(false, true)
           .flip(true, false);
        log("Generating fill image writes via streamdeck API");
        return myStreamDeck.generateFillImageWrites(index, await buf.getBufferAsync(jimp.MIME_JPEG));
    } catch (e) {
        log(e);
        throw e;
    }
}

async function restartHandlers() {
    for (let handler of externalImageHandlers) {
        if (!handler.interval && handler.hasOwnProperty("startLoop"))
            handler.startLoop();
    }
}

function svgtoimg(svgString) {
    return new Promise((resolve, reject) => {
        svg2img(svgString, (err, buff) => {
            if (err)
                reject(err);
            resolve(buff);
        });
    })
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
    client.emitPage(i);

}

function setConfigIcon(page, index, buffer) {
    config.pages[page][index].buffer = buffer;
    if (connected && page === currentPageIndex) {
        setImage(index, buffer);
    }
}

usbDetect.find(4057, async (err, devices) => {
    log(devices);
    if (devices.length) {
        if (!(await attemptConnection())) {
            registerReconnectInterval()
        }
    }
});

class DBusClient {

    constructor() {
        dbus(this, (client) => {
            this.client = client;
        });
    }

    emitPage(page) {
        if (this.client)
            this.client.Page(page);
    }

    getConfig() {
        return rawConfig;
    }

    async updateConfig(newConfig) {
        newConfig = JSON.parse(newConfig);
        let newRawConfig = JSON.parse(JSON.stringify(newConfig));
        let configDiff = diffConfig(newConfig);
        config = newConfig;
        rawConfig = newRawConfig;
        await updateBuffers(configDiff);
        rawConfig.handlers = {...handlers, ...rawConfig.handlers};
        return 0;
    }

    async reloadConfig() {
        return await this.updateConfig(fs.readFileSync(configPath).toString());
    }

    getInfo() {
        return {
            icon_size: myStreamDeck.ICON_SIZE,
            rows: myStreamDeck.KEY_ROWS,
            cols: myStreamDeck.KEY_COLUMNS,
            page: currentPageIndex
        };
    }

    async setPage(page) {
        await setCurrentPage(page);
        return 0;
    }

    commitConfig() {
        fs.writeFileSync(configPath, JSON.stringify(rawConfig));
        return 0;
    }
}

let client = new DBusClient();

let log = (message) => {
    if (process.env.DEBUG)
        console.log(message);
};
