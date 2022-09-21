const fs = require("fs");
const path = require("path");
const Utils = {};

Utils.getLastBlock = () => {
    const buffer = fs.readFileSync(path.resolve(__dirname, './last-block.txt'));
    const lastBLock = Buffer.from(buffer).toString('utf-8');
    return parseInt(lastBLock);
}

Utils.saveLastBlock = (lastBLock) => {
    try {
        fs.writeFileSync(path.resolve(__dirname, './last-block.txt'), lastBLock);
    } catch (error) {
        console.log(error);
    }
}

Utils.getLastBlock();

module.exports = {
    Utils
};