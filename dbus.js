const dbus = require("dbus-native");
const sessionBus = dbus.sessionBus();

const service = 'com.thejonsey.streamdeck';
const interfaceName = service;

const objectPath = `/${service.replace(/\./g, '/')}`;
let currentConfig;
let callback;
let iface;


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

    var ifaceDesc = {
        name: interfaceName,
        methods: {
            GetConfig: ['', 's', [], 'running_config'],
            SetConfig: ['s', 's', ['new_config'], ['action_result']],
            ReloadConfig: ['', '', [], []],
            GetDeckInfo: ['', 's', [], []],
            SetPage: ['s', 's', ['new_page'], ['action_result']],
            CommitConfig: ['', 's', [], ['action_result']]
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
            return JSON.stringify(currentConfig);
        },
        SetConfig: function (newConfig) {
            let status = callback("update-config", newConfig);
            if (status === 0) {
                currentConfig = JSON.parse(newConfig);
                return "SUCCESS";
            } else {
                return "ERROR";
            }
        },
        ReloadConfig: function() {
            currentConfig = callback("reload-config");
        },
        GetDeckInfo: function() {
            return JSON.stringify(callback("get-details"));
        },
        SetPage: function(page) {
            return callback("set-page", parseInt(page)) === 0 ? "SUCCESS" : "ERROR";
        },
        CommitConfig: function() {
            return callback("commit-config") === 0 ? "SUCCESS" : "ERROR";
        },
        emit: function () {

        }
    };

    sessionBus.exportInterface(iface, objectPath, ifaceDesc);
}


module.exports.init = (config, cback) => {
    currentConfig = config;
    callback = cback;
};

module.exports.updatePage = (page) => {
    iface.emit('Page', page);
};
