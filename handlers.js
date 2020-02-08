let customHandlers;

try {
    customHandlers = require("./custom-handlers.js").handlers;
} catch (e) {

}

let handlers = {
    Spotify: "./spotify-handler.js",
    Time: "./time-handler.js",
    Gif: "./gif-handler"
};

if (customHandlers) {
    handlers = {...handlers, ...customHandlers};
}
module.exports.handlers = handlers;