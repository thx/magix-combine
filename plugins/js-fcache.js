let deps = require('./util-deps');
let fileCache = {};
let clearDeps = (f, locker) => {
    delete fileCache[f];
    let dep = deps.inDependencies(f);
    if (dep && !locker[f]) {
        locker[f] = 1;
        let files = deps.getDependencies(f);
        Object.keys(files).forEach((it) => {
            clearDeps(it, locker);
        });
    }
};
module.exports = {
    add(file, key, info) {
        let fInfo = fileCache[file];
        if (!fInfo) {
            fInfo = fileCache[file] = {};
        }
        fInfo[key] = info;
    },
    get(file, key) {
        let fInfo = fileCache[file];
        if (fInfo) {
            return fInfo[key];
        }
        return null;
    },
    clear(file) {
        //delete fileCache[file];
        clearDeps(file, {});
    },
    reset() {
        fileCache = {};
    }
};