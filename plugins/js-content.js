let util = require('util');
let fd = require('./util-fd');
let jsMx = require('./js-mx');
let jsRequire = require('./js-require');
let cssProcessor = require('./css');
let tmplProcessor = require('./tmpl');
let atpath = require('./util-atpath');
let jsLoader = require('./js-loader');
let configs = require('./util-config');

let acorn = require('acorn');
let walker = require('acorn/dist/walk');

let StringReg = /^['"]/;
let mxTailReg = /\.mx$/;
//文件内容处理，主要是把各个处理模块串起来
let moduleIdReg = /(['"])(@moduleId)\1/;
let cssFileReg = /@(?:[\w\.\-\/\\]+?)(?:\.css|\.less|\.scss|\.mx|\.style)/;
let htmlFileReg = /(['"])(raw)?@([^'"]+)\.html(:data|:keys|:events)?\1/;
module.exports = {
    process(from, to, content, outputObject, inwatch) {
        if (!content) content = fd.read(from);
        for (let i = configs.excludeTmplFiles.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFiles[i]) >= 0) {
                return Promise.resolve(content);
            }
        }
        let r = configs.excludeFileContent(content);
        if (r === true) {
            return Promise.resolve(content);
        }
        let contentInfo;
        if (mxTailReg.test(from)) {
            contentInfo = jsMx.process(content, from);
            content = contentInfo.script;
        }
        if (configs.log) {
            console.log('compile:', from.blue);
        }
        let before = configs.compileBeforeProcessor(content, from);
        if (util.isString(before)) {
            before = Promise.resolve(before);
        }
        return before.then((content) => {
            return jsRequire.process({
                fileDeps: {},
                to: to,
                from: from,
                content: content
            });
        }).then((e) => {
            let p = configs.afterDependenceAnalysisProcessor(e);
            if (!p || !p.then) {
                console.log('magix-combine:config > afterDependenceAnalysisProcessor must return a promise'.red);
                p = Promise.resolve(e);
            }
            return p;
        }).then((e) => {
            let tmpl = jsLoader(e);
            let ast;
            try {
                ast = acorn.parse(tmpl);
            } catch (ex) {
                console.log('parse js ast error:', ex.message.red);
                let arr = tmpl.split(/\r\n|\r|\n/);
                let line = ex.loc.line - 1;
                if (arr[line]) {
                    console.log('near code:', arr[line].green);
                }
                console.log(('js file: ' + e.from).red);
                return Promise.reject(ex.message);
            }
            let modifiers = [];
            let processString = (node) => { //存储字符串，减少分析干扰
                StringReg.lastIndex = 0;
                let add = false;
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
                Property(node) {
                    node = node.key;
                    if (node.type == 'Literal') {
                        processString(node);
                    }
                },
                Literal: processString
            });
            modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
                return a.start - b.start;
            });
            for (let i = modifiers.length - 1, m; i >= 0; i--) {
                m = modifiers[i];
                tmpl = tmpl.slice(0, m.start) + m.content + tmpl.slice(m.end);
            }
            e.content = tmpl;
            return Promise.resolve(e);
        }).then((e) => {
            if (contentInfo) e.contentInfo = contentInfo;
            //console.time('css'+e.from);
            return cssProcessor(e, inwatch);
        }).then(tmplProcessor).then((e) => {
            if (outputObject) return Promise.resolve(e);
            return Promise.resolve(e.content);
        }).then(configs.compileAfterProcessor);
    }
};