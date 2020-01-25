const streamdeckd = require("./main.js");
const gifFrames = require("gif-frames");

module.exports = async (page, key, index) => {
    let frames = {delay: 0, frames: []};
    gifFrames({url: key.icon, frames: "all", cumulative: true}, (err, data) => {
        frames.delay = data[0].frameInfo.delay;
        data.forEach(async (frame) => {
            let image = frame.getImage();
            frames.frames[frame.frameIndex] = await streamdeckd.generateBuffer(image._obj, key.text, index);
            if (frames.frames.length === data.length) {
                startLoop(frames, page, index);
            }
        })
    })
};

function startLoop(frames, page, index) {
    let currentFrame = 0;
    setInterval(() => {
        streamdeckd.setConfigIcon(page, index, frames.frames[currentFrame]);
        currentFrame++;
        if (currentFrame === frames.frames.length) {
            currentFrame = 0;
        }
    }, frames.delay * 10);
}
