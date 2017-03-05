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
var moduleIdReg = /(['"])(@moduleId)\1/;
var cssFileReg = /@(?:[\w\.\-\/\\]+?)(?:\.css|\.less|\.scss|\.mx)/;
var htmlFileReg = /(['"])(raw)?@([^'"]+)\.html(:data|:keys|:events)?\1/;
module.exports = {
    process: function(from, to, content, outputObject) {
        if (!content) content = fd.read(from);
        for (var i = configs.excludeTmplFiles.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFiles[i]) >= 0) {
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
        if (configs.log) {
            console.log('compile:', from.blue);
        }
        return jsRequire.process({
            fileDeps: {},
            to: to,
            from: from,
            content: content
        }).then(function(e) {
            var tmpl = jsLoader(e);
            var ast;
            try {
                ast = acorn.parse(tmpl);
            } catch (ex) {
                console.log('parse js ast error:', ex.message);
                var arr = tmpl.split(/\r\n|\r|\n/);
                var line = ex.loc.line - 1;
                if (arr[line]) {
                    console.log('near code:', arr[line].green);
                }
                console.log(('js file: ' + e.from).red);
                return Promise.reject(ex.message);
            }
            var modifiers = [];
            var processString = function(node) { //存储字符串，减少分析干扰
                StringReg.lastIndex = 0;
                var add = false;
                if (StringReg.test(node.raw)) {
                    if (moduleIdReg.test(node.raw)) {
                        node.raw = node.raw.replace(moduleIdReg, '$1' + e.moduleId + '$1');
                        add = true;
                    } else if (cssFileReg.test(node.raw) || htmlFileReg.test(node.raw)) {
                        node.raw = node.raw.replace(/@/g, '\u0012@');
                        add = true;
                    } else if (configs.useAtPathConverter) {
                        if (node.raw.charAt(1) == '@' && node.raw.lastIndexOf('@') == 1 && node.raw.indexOf('/') > 0) {
                            node.raw = atpath.resolvePath(node.raw, e.moduleId);
                            add = true;
                        }
                    }
                    if (add) {
                        modifiers.push({
                            start: node.start,
                            end: node.end,
                            content: node.raw
                        });
                    }
                }
            };
            walker.simple(ast, {
                Property: function(node) {
                    node = node.key;
                    if (node.type == 'Literal') {
                        processString(node);
                    }
                },
                Literal: processString
            });
            modifiers.sort(function(a, b) { //根据start大小排序，这样修改后的fn才是正确的
                return a.start - b.start;
            });
            for (var i = modifiers.length - 1, m; i >= 0; i--) {
                m = modifiers[i];
                tmpl = tmpl.slice(0, m.start) + m.content + tmpl.slice(m.end);
            }
            e.content = tmpl;
            return Promise.resolve(e);
        }).then(function(e) {
            if (contentInfo) e.contentInfo = contentInfo;
            //console.time('css'+e.from);
            return cssProcessor(e);
        }).then(tmplProcessor).then(function(e) {
            if (outputObject) return Promise.resolve(e);
            return Promise.resolve(e.content);
        });
    }
};