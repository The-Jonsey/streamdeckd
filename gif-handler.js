const gifFrames = require("gif-frames");

module.exports = class GifHandler {

    constructor(page, index, generateBuffer, setConfigIcon, key) {
        this.page = page;
        this.key = key;
        this.generateBuffer = generateBuffer;
        this.setConfigIcon = setConfigIcon;
        this.index = index;
        this.interval = undefined;
        this.frames = {delay: 0, frames: []};
        this.init();
    }

    init () {
        if (this.interval)
            return;
        if (this.frames.frames.length)
            return this.startLoop();
        gifFrames({url: this.key.icon, frames: "all", cumulative: true}, (err, data) => {
            this.frames.delay = data[0].frameInfo.delay;
            data.forEach(async (frame) => {
                let image = frame.getImage();
                this.frames.frames[frame.frameIndex] = await this.generateBuffer(image._obj, this.key.text, this.index);
                if (this.frames.frames.length === data.length) {
                    this.startLoop();
                }
            })
        })
    }

    cleanup () {
        this.stopLoop();
        for (let i = 0; i < this.frames.frames.length; i++) {
            delete this.frames.frames[i];
        }
    }

    stopLoop() {
        clearInterval(this.interval);
        this.interval = undefined;
    }

    startLoop() {
        let currentFrame = 0;
        this.interval = setInterval(() => {
            this.setConfigIcon(this.page, this.index, this.frames.frames[currentFrame]);
            currentFrame++;
            if (currentFrame === this.frames.frames.length) {
                currentFrame = 0;
            }
        }, this.frames.delay * 10);
    }
};
