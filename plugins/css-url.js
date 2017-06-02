//处理css中的url资源
let UrlReg = /url\(([^\)]+)\)/g;
let configs = require('./util-config');
let slog = require('./util-log');
module.exports = (css, name) => {
    css = css.replace(UrlReg, (match, content) => {
        content = configs.cssUrlMatched(content);
        if (configs.check) {
            slog.ever('css-url match:', content, name.gray);
        }
        return 'url(' + content + ')';
    });
    return css;
};