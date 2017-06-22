let util = require('util');
let fd = require('./util-fd');
let jsMx = require('./js-mx');
let jsRequire = require('./js-require');
let cssProcessor = require('./css');
let tmplProcessor = require('./tmpl');
let atpath = require('./util-atpath');
let jsLoader = require('./js-loader');
let configs = require('./util-config');
let checker = require('./checker');

let slog = require('./util-log');
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let fileCache = require('./js-fcache');
let jsSnippet = require('./js-snippet');

let StringReg = /^['"]/;
let mxTailReg = /\.mx$/;
//文件内容处理，主要是把各个处理模块串起来
let moduleIdReg = /(['"])(@moduleId)\1/;
let cssFileReg = /@(?:[\w\.\-\/\\]+?)(?:\.css|\.less|\.scss|\.mx|\.style)/;
let htmlFileReg = /(['"])(?:raw)?@[^'"]+\.html(:data|:keys|:events)?\1/;
let othersFileReg = /(['"])([a-z,]+)?@([^'"]+\.[a-z]{2,})\1;?/;
let snippetReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])#snippet(?:[\w+\-])?\1\s*;?/g;
let excludeReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])#exclude\(([\w,]+)\)\1\s*;?/g;
/*
    '#snippet';
    '#exclude(define,beforeProcessor,after)';
 */
let processContent = (from, to, content, inwatch) => {
    if (!content) content = fd.read(from);
    let contentInfo;
    if (mxTailReg.test(from)) {
        contentInfo = jsMx.process(content, from);
        content = contentInfo.script;
    }
    content = configs.beforeProcessContent(content, from);
    let execBeforeProcessor = true,
        execAfterProcessor = true;
    let exclude = false;
    content = content.replace(excludeReg, (m, q, keys) => {
        keys = keys.split(',');
        if (keys.indexOf('define') > -1 || keys.indexOf('loader') > -1) {
            exclude = true;
        }
        if (keys.indexOf('before') > -1 || keys.indexOf('beforeProcessor') > -1) {
            execBeforeProcessor = false;
        }
        if (keys.indexOf('after') > -1 || keys.indexOf('afterProcessor') > -1) {
            execAfterProcessor = false;
        }
        return '';
    });
    let isSnippet = snippetReg.test(content);
    snippetReg.lastIndex = 0;
    content = content.replace(snippetReg, '');
    let key = [inwatch, exclude].join('\u0000');
    let fInfo = fileCache.get(from, key);
    if (fInfo) {
        /*
            a.html
            a.js

            m.html
            m.js <'@a.js'>

            c.js <'@m.js'>

            a.html change -> runDeps a.js -> runDeps m.js -> runDeps c.js
        */
        return Promise.resolve(fInfo);
    }
    let before = Promise.resolve(content);
    if (execBeforeProcessor) {
        before = configs.compileBeforeProcessor(content, from);
        if (util.isString(before)) {
            before = Promise.resolve(before);
        }
    }
    if (configs.log && inwatch) {
        slog.ever('compile:', from.blue);
    }
    return before.then(content => {
        return jsRequire.process({
            fileDeps: {},
            exclude: exclude,
            to: to,
            from: from,
            shortFrom: from.replace(configs.moduleIdRemovedPath, '').slice(1),
            content: content,
            writeFile: !isSnippet,
            processContent: processContent
        });
    }).then(e => {
        let tmpl = e.exclude ? e.content : jsLoader(e);
        let ast;
        try {
            ast = acorn.parse(tmpl);
        } catch (ex) {
            slog.ever('parse js ast error:', ex.message.red);
            let arr = tmpl.split(/\r\n|\r|\n/);
            let line = ex.loc.line - 1;
            if (arr[line]) {
                slog.ever('near code:', arr[line].green);
            }
            slog.ever(('js file: ' + e.from).red);
            return Promise.reject(ex);
        }
        let modifiers = [];
        let toTops = [];
        let toBottoms = [];
        let processString = node => { //存储字符串，减少分析干扰
            StringReg.lastIndex = 0;
            let add = false;
            if (StringReg.test(node.raw)) {
                if (moduleIdReg.test(node.raw)) {
                    node.raw = node.raw.replace(moduleIdReg, '$1' + e.moduleId + '$1');
                    add = true;
                } else if (cssFileReg.test(node.raw) || htmlFileReg.test(node.raw)) {
                    node.raw = node.raw.replace(/@/g, '\u0012@');
                    add = true;
                } else if (othersFileReg.test(node.raw)) {
                    let replacement = '';
                    node.raw.replace(othersFileReg, (m, q, actions, file) => {
                        if (actions) {
                            actions = actions.split(',');
                            //let as = [];
                            //if (actions.indexOf('compile') > -1) {
                            //    as.push('compile');
                            //}
                            replacement = q + /*as.join('') +*/ '\u0012@' + file + q;
                            if (actions.indexOf('top') > -1) {
                                toTops.push(replacement);
                                replacement = '';
                            } else if (actions.indexOf('bottom') > -1) {
                                toBottoms.push(replacement);
                                replacement = '';
                            }
                        } else {
                            replacement = node.raw.replace(/@/g, '\u0012@');
                        }
                    });
                    node.raw = replacement;
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
        if (configs.check) {
            let walkerProcessor = checker.JS.getWalker(tmpl, e);
            walker.simple(ast, walkerProcessor);
        }
        modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
            return a.start - b.start;
        });
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            tmpl = tmpl.slice(0, m.start) + m.content + tmpl.slice(m.end);
        }
        if (toTops.length) {
            tmpl = toTops.join(';\r\n') + '\r\n' + tmpl;
        }
        if (toBottoms.length) {
            tmpl = tmpl + '\r\n' + toBottoms.join(';\r\n');
        }
        e.content = tmpl;
        return Promise.resolve(e);
    }).then(e => {
        if (contentInfo) e.contentInfo = contentInfo;
        return cssProcessor(e, inwatch);
    }).then(tmplProcessor).then(jsSnippet).then(e => {
        if (execAfterProcessor) {
            return configs.compileAfterProcessor(e);
        }
        return e;
    }).then(e => {
        fileCache.add(e.from, key, e);
        return e;
    });
};
module.exports = {
    process: processContent
};