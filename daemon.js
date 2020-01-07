#!/usr/bin/env node
const path = require("path");
const ps = require("ps-node");
const daemonize = require('daemonize-process');
ps.lookup({command: "streamdeckd"}, (err, resList) => {
    if (err) {
        throw new Error(err);
    }
    else if (resList.length > 0) {
        console.log("streamdeckd already running");
    }
    else {
        daemonize({
            script: path.resolve(__dirname, "main.js")
        });
    }
});