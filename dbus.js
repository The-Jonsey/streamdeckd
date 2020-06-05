const dbus = require("dbus-native");
const sessionBus = dbus.sessionBus();

const service = 'com.thejonsey.streamdeck';
const interfaceName = service;

const objectPath = `/${service.replace(/\./g, '/')}`;
let BusClient;
let iface;
let callback;

sessionBus.requestName(service, 0x4, (err, retCode) => {

    if (err) {
        throw new Error(
            `Could not request service name ${service}, the error was: ${err}.`
        );
    }

    // Return code 0x1 means we successfully had the name
    if (retCode === 1) {
        proceed();
    } else {
        /* Other return codes means various errors, check here
        (https://dbus.freedesktop.org/doc/api/html/group__DBusShared.html#ga37a9bc7c6eb11d212bf8d5e5ff3b50f9) for more
        information
        */
        throw new Error(
            `Failed to request service name "${
                service
            }". Check what return code "${retCode}" means.`
        );
    }
});


function proceed() {

    let ifaceDesc = {
        name: interfaceName,
        methods: {
            GetConfig: ['', 's', [], 'running_config'],
            SetConfig: ['s', '', ['new_config'], []],
            ReloadConfig: ['', '', [], []],
            GetDeckInfo: ['', 's', [], []],
            SetPage: ['i', '', ['new_page'], []],
            CommitConfig: ['', '', [], []]
        },
        signals: {
            Page: ['i', 'page_number']
        }
    };

    iface = {
        /**
         * @return {string}
         */
        GetConfig: function () {
            return JSON.stringify(BusClient.getConfig());
        },
        SetConfig: async function (newConfig) {
            try {
                await BusClient.updateConfig(newConfig);
            } catch (e) {
                console.log(e.stackTrace);
                throw e;
                //throw new Error("Error setting config");
            }
        },
        ReloadConfig: async function() {
            try {
                await BusClient.reloadConfig();
            } catch (e) {
                throw new Error("Error reloading config");
            }
        },
        /**
         * @return {string}
         */
        GetDeckInfo: function() {
            return JSON.stringify(BusClient.getInfo());
        },
        SetPage: async function(page) {
            try {
                await BusClient.setPage(page);
            } catch (e) {
                throw new Error("Error setting page");
            }
        },
        CommitConfig: async function() {
            try {
                BusClient.commitConfig();
            } catch (e) {
                throw new Error("Error committing config");
            }
        },

        emit: function () {

        },

        Page: function (page) {
            this.emit('Page', page);
        }
    };

    callback(iface);

    sessionBus.exportInterface(iface, objectPath, ifaceDesc);
}

/**
 * @param client {DBusClient}
 * @param cback {Function}
 * @returns {void}
 */
module.exports = (client, cback) => {
    BusClient = client;
    callback = cback;
};
