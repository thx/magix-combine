let fs = require('fs');
let path = require('path');
let fileNames = ['_config', 'config', 'cfg', '_cfg'];
let suffixes = ['mjs', 'js'];
let cache = Object.create(null);
module.exports = (root, prefix) => {
    let cfg = {},
        configFile = '',
        key = root + '\x00' + prefix;
    if (cache[key]) {
        return cache[key];
    }
    for (let fn of fileNames) {
        for (let s of suffixes) {
            configFile = path.join(root, fn + '.' + s);
            if (fs.existsSync(configFile)) {
                cfg = require(configFile);
                break;
            }
        }
    }
    for (let p in cfg) {
        if (!p.startsWith(prefix)) {
            throw new Error('[MXC Error(tmpl-customtag-cfg)] bad config at ' + configFile + '. Only property key starts with ' + prefix + ' support');
        }
    }
    cache[key] = cfg;
    return cfg;
};