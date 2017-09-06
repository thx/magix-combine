/*
    处理css中的url资源，比如内嵌、转换图片质量、高清屏适应等
    https://github.com/thx/magix-combine/issues/25
 */
let configs = require('./util-config');
let slog = require('./util-log');
let chalk = require('chalk');
let cache = {};
let processor = (url, short) => {
    if (cache.hasOwnProperty(url)) {
        return Promise.resolve(cache[url]);
    } else {
        if (configs.checker.cssUrl) {
            slog.ever('css-url match:', url, chalk.grey(short));
        }
        let content = configs.cssUrlMatched(url);
        if (!content.then) {
            content = Promise.resolve(content);
        }
        return content.then(r => {
            r = 'url(' + r + ')';
            cache[url] = r;
            return Promise.resolve(r);
        });
    }
};
processor.clear = file => {
    delete cache[file];
};
module.exports = processor;