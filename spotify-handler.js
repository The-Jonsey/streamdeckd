const dbus = require("dbus-native");
const request = require('request');

module.exports = class SpotifyHandler {

    constructor(page, index, generateBuffer, setConfigIcon) {
        this.page = page;
        this.index = index;
        this.generateBuffer = generateBuffer;
        this.setConfigIcon = setConfigIcon;
        this.interval = undefined;
        this.buffer = undefined;
        this.currentURL = "";
        this.init();
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
                    return;
                }
                iface.Get("org.mpris.MediaPlayer2.Player", "Metadata", (err, str) => {
                    if (err) {
                        return;
                    }
                    try {
                        let url = str[1][0][2][1][1][0];
                        if (url !== this.currentURL) {
                            request(url, {encoding: null}, async (err, res, body) => {
                                this.currentURL = url;
                                this.buffer = await this.generateBuffer(body, undefined, this.index);
                                this.setConfigIcon(this.page, this.index, this.buffer);
                            });
                        }
                    } catch (e) {

                    }
                })
            });
        }, 1000);
    }
};
