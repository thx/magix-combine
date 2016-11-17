//处理css中的url资源
var UrlReg = /url\(([^\)]+)\)/g;
module.exports = function(css) {
    css = css.replace(UrlReg, function(match, content) {
        console.log('css-url,match:', content);
        //return 'url("+Magix.url("' + content + '")+"';
        return match;
    });
    return css;
};