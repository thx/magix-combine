var configs = require('./util-config');
var tmplCmd = require('./tmpl-cmd');
//模板代码片断的处理，较少用
var snippetReg = /<mx-([\w-]+)([^>]*)>([\s\S]*?)<\/mx-\1>/g;
var snippetReg1 = /<mx-([\w-]+)([^>]*)\/>/g;
module.exports = {
    process: function(tmpl, extInfo) {
        var compare;
        var cmdCache = {};
        tmpl = tmplCmd.store(tmpl, cmdCache);
        var restore = function(tmpl) {
            return tmplCmd.recover(tmpl, cmdCache);
        };
        var tagProcessor = function(match, tag, attrs, content) {
            attrs = restore(attrs);
            var result = {
                name: tag,
                tag: tag,
                content: content,
                attrs: attrs
            };
            return configs.mxTagProcessor(result, extInfo);
        };
        var tagProcessor1 = function(match, tag, attrs) {
            attrs = restore(attrs);
            var result = {
                name: tag,
                tag: tag,
                content: '',
                attrs: attrs
            };
            return configs.mxTagProcessor(result, extInfo);
        };
        while (snippetReg.test(tmpl) || snippetReg1.test(tmpl)) {
            compare = tmpl.replace(snippetReg, tagProcessor).replace(snippetReg1, tagProcessor1);
            if (compare == tmpl) {
                break;
            } else {
                tmpl = compare;
            }
        }
        tmpl = restore(tmpl);
        return tmpl;
    }
};