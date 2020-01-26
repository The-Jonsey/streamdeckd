const streamdeckd = require("./main.js");
let interval;

module.exports = (page, key, index) => {
    if (interval)
        return;
    let colon = true;
    interval = setInterval(async () => {
        let now = new Date();
        let buffer = await streamdeckd.generateBuffer(undefined, zeros(now.getHours()) + (colon ? ":" : " ") + zeros(now.getMinutes()), index);
        streamdeckd.setConfigIcon(page, index, buffer);
        colon = !colon
    }, 1000)
};

function zeros(n) {
    return n < 10 ? "0" + n : n;
}
