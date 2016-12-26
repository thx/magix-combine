//处理css中的url资源
var UrlReg = /url\(([^\)]+)\)/g;
var configs = require('./util-config');
module.exports = function(css) {
    css = css.replace(UrlReg, function(match, content) {
        console.log('css-url match:', content);
        content = configs.cssUrlMatched(content);
        return 'url(' + content + ')';
    });
    return css;
};