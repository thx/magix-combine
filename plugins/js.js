let path = require('path');
let fs = require('fs');
let fd = require('./util-fd');
let jsContent = require('./js-content');
let deps = require('./util-deps');
let configs = require('./util-config');
//文件处理
let processFile = (from, to, inwatch) => { // d:\a\b.js  d:\c\d.js
    return new Promise((resolve, reject) => {
        from = path.resolve(from);
        if (configs.log) {
            console.log('start process:', from);
        }
        to = path.resolve(to);
        let promise = Promise.resolve();
        if (inwatch && deps.inDependencies(from)) {
            promise = deps.runFileDepend(from);
        }
        if (fs.existsSync(from)) {
            promise = promise.then(() => {
                let p = configs.startProcessor(from, to);
                if (!p || !p.then) {
                    console.log('magix-combine:config > startProcessor must return a promise'.red);
                    p = Promise.resolve();
                }
                return p;
            });
            if (configs.compileFileExtNamesReg.test(from)) {
                promise.then(() => {
                    return jsContent.process(from, to, 0, 0, inwatch);
                }).then((content) => {
                    to = to.replace(configs.compileFileExtNamesReg, '.js');
                    fd.write(to, content);
                    resolve();
                    if (configs.log) {
                        console.log('finish:', from.green);
                    }
                }, reject);
            } else {
                promise.then(resolve);
            }
        } else {
            promise.then(resolve);
        }
    });
};
module.exports = deps.setContext({
    process: processFile
});