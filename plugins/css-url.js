//处理css中的url资源
let UrlReg = /url\(([^\)]+)\)/g;
let configs = require('./util-config');
module.exports = (css) => {
    css = css.replace(UrlReg, (match, content) => {
        if (configs.log) {
            console.log('css-url match:', content);
        }
        content = configs.cssUrlMatched(content);
        return 'url(' + content + ')';
    });
    return css;
};