//处理css中的url资源
let UrlReg = /url\(([^\)]+)\)/g;
let configs = require('./util-config');
let slog = require('./util-log');
module.exports = (css) => {
    css = css.replace(UrlReg, (match, content) => {
        if (configs.log) {
            slog.ever('css-url match:', content);
        }
        content = configs.cssUrlMatched(content);
        return 'url(' + content + ')';
    });
    return css;
};