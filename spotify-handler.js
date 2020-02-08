const dbus = require("dbus-native");
const request = require('request');

module.exports.icon = class SpotifyHandler {

    constructor(page, index, generateBuffer, setConfigIcon, key) {
        this.page = page;
        this.index = index;
        this.generateBuffer = generateBuffer;
        this.setConfigIcon = setConfigIcon;
        this.key = key;
        this.interval = undefined;
        this.buffer = undefined;
        this.currentURL = "";
        this.init();
        this.blank = false;
    }

    init () {
        if (this.interval)
            return;
        this.startLoop();
    }

    cleanup () {
        this.stopLoop();
        this.buffer = undefined;
        this.currentURL = "";
    }

    stopLoop() {
        clearInterval(this.interval);
        this.interval = undefined;
    }

    startLoop() {
        this.interval = setInterval(() => {
            dbus.sessionBus().getService("org.mpris.MediaPlayer2.spotify").getInterface("/org/mpris/MediaPlayer2", "org.freedesktop.DBus.Properties", (err, iface) => {
                if (err) {
                    return this.setBlank();
                }
                iface.Get("org.mpris.MediaPlayer2.Player", "Metadata", (err, str) => {
                    if (err) {
                        return this.setBlank;
                    }
                    try {
                        let url = str[1][0][2][1][1][0];
                        if (url !== this.currentURL) {
                            this.key.icon = url;
                            request(url, {encoding: null}, async (err, res, body) => {
                                this.currentURL = url;
                                this.buffer = await this.generateBuffer(body, undefined, this.index);
                                this.setConfigIcon(this.page, this.index, this.buffer);
                                this.blank = false;
                            });
                        }
                    } catch (e) {
                        return this.setBlank();
                    }
                })
            });
        }, 1000);
    }

    async setBlank() {
        if (!this.blank) {
            this.buffer = await this.generateBuffer(undefined, undefined, this.index);
            this.setConfigIcon(this.page, this.index, this.buffer);
        }
        this.blank = true;
    }
};
