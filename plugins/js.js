var path = require('path');
var fs = require('fs');
var fd = require('./util-fd');
var jsContent = require('./js-content');
var deps = require('./util-deps');
var configs = require('./util-config');
//文件处理
/*var extnames = {
    '.html': 1,
    '.css': 1,
    '.less': 1,
    '.scss': 1
};*/
var jsOrMxTailReg = /\.(?:js|mx)$/i;
var mxTailReg = /\.mx$/;
//var sep = path.sep;
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
        if (jsOrMxTailReg.test(from)) {
            if (fs.existsSync(from)) {
                promise.then(function() {
                    return jsContent.process(from, to);
                }).then(function(content) {
                    to = to.replace(mxTailReg, '.js');
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
            //var extname = path.extname(from);
            promise.then(resolve);
            /*if (extnames[extname] === 1) {
                var name = path.basename(from, extname);
                var ns = name.split('-');
                var found;
                while (ns.length) {
                    var tname = ns.join('-');
                    var jsf = path.dirname(from) + sep + tname + '.js';
                    ns.pop();
                    if (fs.existsSync(jsf)) {
                        found = true;
                        var aimFile = path.dirname(to) + sep + path.basename(jsf);
                        deps.addFileDepend(from, jsf, aimFile);
                        if (inwatch) {
                            processFile(jsf, aimFile, inwatch).then(resolve);
                        } else {
                            resolve();
                        }
                        break;
                    }
                }
                resolve();
            } else {
                resolve();
            }*/
        }
    });
};
module.exports = deps.setContext({
    process: processFile
});