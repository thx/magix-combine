var fd = require('./util-fd');
var jsMx = require('./js-mx');
var jsRequire = require('./js-require');
var cssProcessor = require('./css');
var tmplProcessor = require('./tmpl');
var atpath = require('./util-atpath');
var jsLoader = require('./js-loader');
var configs = require('./util-config');

var acorn = require('./util-acorn');
var walker = require('./util-acorn-walk');

var StringReg = /^['"]/;
var mxTailReg = /\.mx$/;
//文件内容处理，主要是把各个处理模块串起来
var moduleIdReg = /(['"])(@moduleId)\1/g;
module.exports = {
    process: function(from, to, content) {
        if (!content) content = fd.read(from);
        for (var i = configs.excludeTmplFolders.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFolders[i]) >= 0) {
                return Promise.resolve(content);
            }
        }
        var r = configs.excludeFileContent(content);
        if (r === true) {
            return Promise.resolve(content);
        }
        var contentInfo;
        if (mxTailReg.test(from)) {
            contentInfo = jsMx.process(content, from);
            content = contentInfo.script;
        }
        return jsRequire.process({
            from: from,
            content: content
        }).then(function(e) {
            e.to = to;
            if (contentInfo) e.contentInfo = contentInfo;
            return cssProcessor(e);
        }).then(tmplProcessor).then(function(e) {
            e.content = e.content.replace(moduleIdReg, '$1' + e.moduleId + '$1');
            if (configs.useAtPathConverter) {
                var ast;
                try {
                    ast = acorn.parse(e.content);
                } catch (ex) {
                    console.log('parse ast error:', ex);
                    console.log(('js file: ' + e.from).red);
                    return Promise.reject(ex);
                }
                var modifiers = [];
                walker.simple(ast, {
                    Literal: function(node) { //存储字符串，减少分析干扰
                        StringReg.lastIndex = 0;
                        if (StringReg.test(node.raw)) {
                            if (node.raw.charAt(1) == '@' && node.raw.lastIndexOf('@') == 1 && node.raw.indexOf('/') > 0) {
                                node.raw = atpath.resolvePath(node.raw, e.moduleId);
                            }
                            modifiers.push({
                                start: node.start,
                                end: node.end,
                                content: node.raw
                            });
                        }
                    }
                });
                modifiers.sort(function(a, b) { //根据start大小排序，这样修改后的fn才是正确的
                    return a.start - b.start;
                });
                for (var i = modifiers.length - 1, m; i >= 0; i--) {
                    m = modifiers[i];
                    e.content = e.content.slice(0, m.start) + m.content + e.content.slice(m.end);
                }
            }
            var tmpl = jsLoader(e);
            return Promise.resolve(tmpl);
        });
    }
};