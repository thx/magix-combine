//处理img标签
var configs = require('./util-config');
var tmplCmd = require('./tmpl-cmd');
var imgTagReg = /<img[^>]*>/ig;
var srcReg = /src\s*=\s*(["'])([\s\S]+?)\1(?=\s|\/|>)/ig;
module.exports = {
    process: function(tmpl) {
        var cmdCache = {};
        tmpl = tmplCmd.store(tmpl, cmdCache);
        var restore = function(tmpl) {
            return tmplCmd.recover(tmpl, cmdCache);
        };
        var attrsProcessor = function(attrs) {
            attrs = attrs.replace(srcReg, function(match, q, value) {
                console.log('tmpl-img match:', value);
                value = configs.tmplImgSrcMatched(value);
                return 'src=' + q + value + q;
            });
            return attrs;
        };
        var tagProcessor = function(match) {
            match = restore(match);
            match = attrsProcessor(match);
            return match;
        };
        tmpl = tmpl.replace(imgTagReg, tagProcessor);
        tmpl = restore(tmpl);
        return tmpl;
    }
};