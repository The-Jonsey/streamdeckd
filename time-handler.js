module.exports.icon = class TimeHandler {

    constructor(page, index, generateBuffer, setConfigIcon) {
        this.page = page;
        this.index = index;
        this.generateBuffer = generateBuffer;
        this.setConfigIcon = setConfigIcon;
        this.interval = undefined;
        this.buffer = undefined;
        this.colon = undefined;
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
        this.colon = undefined;
    }

    stopLoop() {
        clearInterval(this.interval);
        this.interval = undefined;
    }

    startLoop() {
        this.colon = true;
        this.interval = setInterval(async () => {
            let now = new Date();
            this.buffer = await this.generateBuffer(undefined, zeros(now.getHours()) + (this.colon ? ":" : " ") + zeros(now.getMinutes()), this.index);
            this.setConfigIcon(this.page, this.index, this.buffer);
            this.colon = !this.colon
        }, 1000);
    }
};

function zeros(n) {
    return n < 10 ? "0" + n : n;
}