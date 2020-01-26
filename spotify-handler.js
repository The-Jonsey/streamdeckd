const streamdeckd = require("./main.js");
const dbus = require("dbus-native");
const request = require('request');
let interval;
let buffer;

module.exports = {
    init: (page, key, index) => {
        let currentURL = "";
        if (interval)
            return;
        interval = setInterval(() => {
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
                        if (url !== currentURL) {
                            request(url, {encoding: null}, async (err, res, body) => {
                                buffer = await streamdeckd.generateBuffer(body, undefined, index);
                                streamdeckd.setConfigIcon(page, index, buffer);
                            });
                        }
                    } catch (e) {

                    }
                })
            });
        }, 1000);
    },
    cleanup: () => {
        clearInterval(interval);
        interval = undefined;
        buffer = null;
    }
};
