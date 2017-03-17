var path = require('path');
var fs = require('fs');
var fd = require('./util-fd');
var jsContent = require('./js-content');
var deps = require('./util-deps');
var configs = require('./util-config');
//文件处理
var processFile = function(from, to, inwatch) { // d:\a\b.js  d:\c\d.js
    return new Promise(function(resolve, reject) {
        from = path.resolve(from);
        if (configs.log) {
            console.log('start process:', from);
        }
        to = path.resolve(to);
        var promise = Promise.resolve();
        if (inwatch && deps.inDependencies(from)) {
            promise = deps.runFileDepend(from);
        }
        if (configs.compileFileExtNamesReg.test(from)) {
            if (fs.existsSync(from)) {
                promise.then(function() {
                    return jsContent.process(from, to);
                }).then(function(content) {
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