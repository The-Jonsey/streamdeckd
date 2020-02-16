
class Counter {

    constructor(page, index, generateBuffer, setConfigIcon) {
        this.value = 0;
        this.page = page;
        this.index = index;
        this.generateBuffer = generateBuffer;
        this.setConfigIcon = setConfigIcon;
        this.setIcon();
    }

    setIcon() {
        this.generateBuffer(undefined, this.value.toString(), this.index).then((buffer) =>{
            this.setConfigIcon(this.page, this.index, buffer);
        });
    }

    incrementCounter() {
        this.value += 1;
        this.setIcon();
    }
}


function counter(page, index, key) {
    if (key.iconHandler instanceof module.exports.icon)
        key.iconHandler.incrementCounter();
    else
        throw new Error();
}

module.exports = {
    key: counter,
    icon: Counter
};