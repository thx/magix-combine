var configs = require('./util-config');
var tmplCmd = require('./tmpl-cmd');
//模板代码片断的处理，较少用
var snippetReg = /<mx-(\w+)([^>]*)>([\s\S]*?)<\/mx-\1>/g;
var attrReg = /([\w-\d]+)\s*=\s*"([^"]+)"/g;
module.exports = {
    process: function(tmpl) {
        var compare;
        var cmdCache = {};
        tmpl = tmplCmd.store(tmpl, cmdCache);
        var restore = function(tmpl) {
            return tmplCmd.recover(tmpl, cmdCache);
        };
        var analyseAttrs = function(attrs) {
            var a = [];
            attrs.replace(attrReg, function(match, key, value) {
                var temp = {
                    key: key,
                    origin: match,
                    value: value
                };
                if (key.indexOf('mx-') === 0) {
                    temp.isMxKey = true;
                }
                if (value.indexOf('<%:') === 0) {
                    temp.isBindValue = true;
                }
                a.push(temp);
            });
            return a;
        };
        var tagProcessor = function(match, tag, attrs, content) {
            attrs = restore(attrs);
            var result = {
                tag: tag,
                content: content,
                attrs: analyseAttrs(attrs)
            };
            return configs.mxTagProcessor(result);
        };
        while (snippetReg.test(tmpl)) {
            compare = tmpl.replace(snippetReg, tagProcessor);
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