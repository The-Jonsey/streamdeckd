const dbus = require("dbus-native");
const fs = require("fs");

const sessionBus = dbus.sessionBus();

const service = 'com.thejonsey.streamdeck';
const interfaceName = service;

const objectPath = `/${service.replace(/\./g, '/')}`;
let currentConfig;
let configPath;
let callback;

sessionBus.requestName(service, 0x4, (err, retCode) => {

    if (err) {
        throw new Error(
            `Could not request service name ${service}, the error was: ${err}.`
        );
    }

    // Return code 0x1 means we successfully had the name
    if (retCode === 1) {
        console.log(`Successfully requested service name "${service}"!`);
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
            ReloadConfig: ['', '', [], []]
        }
    };

    var iface = {
        /**
         * @return {string}
         */
        GetConfig: function () {
            console.log("GetConfig called");
            console.log(currentConfig);
            return JSON.stringify(currentConfig);
        },
        SetConfig: function (newConfig) {
            let status = callback(newConfig);
            if (status === 0) {
                currentConfig = JSON.parse(newConfig);
                return "SUCCESS";
            } else {
                return "ERROR";
            }
        },
        ReloadConfig: function() {
            let config = fs.readFileSync(configPath);
            currentConfig = JSON.parse(config);
            callback(config);
        },
        emit: function () {

        }
    };

    sessionBus.exportInterface(iface, objectPath, ifaceDesc);

    console.log("Interface exposed to DBus");
}


module.exports = function (config, path, cback) {
    currentConfig = config;
    configPath = path;
    callback = cback;
};
