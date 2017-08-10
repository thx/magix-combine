/*
    处理css中的url资源，比如内嵌、转换图片质量、高清屏适应等
    https://github.com/thx/magix-combine/issues/25
 */
let urlReg = /url\(([^\)]+)\)/g;
let configs = require('./util-config');
let slog = require('./util-log');
let chalk = require('chalk');
module.exports = (css, name) => {
    css = css.replace(urlReg, (match, content) => {
        content = configs.cssUrlMatched(content);
        if (configs.checker.cssUrl) {
            slog.ever('css-url match:', content, chalk.grey(name));
        }
        return 'url(' + content + ')';
    });
    return css;
};