/*
    js内容处理
    mx单文件转换->开始编译钩子(beforeProcessor,es6->es3)->js中的@规则识别及代码检查->处理样式->处理模板->处理js代码片断->编译结束钩子->缓存文件内容
 */
let util = require('util');
let chalk = require('chalk');
let fd = require('./util-fd');
let jsMx = require('./js-mx');
let jsRequire = require('./js-require');
let cssProcessor = require('./css');
let tmplProcessor = require('./tmpl');
let atpath = require('./util-atpath');
let jsWrapper = require('./js-wrapper');
let configs = require('./util-config');
let checker = require('./checker');
let md5 = require('./util-md5');

let slog = require('./util-log');
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let fileCache = require('./js-fcache');
let jsSnippet = require('./js-snippet');
let jsHeader = require('./js-header');

let lineBreakReg = /\r\n?|\n|\u2028|\u2029/;
let mxTailReg = /\.mx$/;
let stringReg = /^['"]/;
//文件内容处理，主要是把各个处理模块串起来
let moduleIdReg = /^(['"])(@moduleId)\1$/;
let cssFileReg = /@(?:[\w\.\-\/\\]+?)\.(?:css|less|scss|sass|mx|style)/;
let othersFileReg = /(['"])([a-z,]+)?@([\w\.\-\/\\]+\.[a-z]{2,})\1;?/;
let revisableReg = /@\{[^\{\}]+\}/g;
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

    let headers = jsHeader(content);
    content = headers.content;

    let key = [inwatch, headers.addWrapper].join('\u0000');
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
    let originalContent = content;
    if (headers.execBeforeProcessor) {
        let processor = configs.compileBeforeProcessor || configs.compileJSStart;
        before = processor(content, from);
        if (util.isString(before)) {
            before = Promise.resolve(before);
        }
    }
    if (configs.log && inwatch) {
        slog.ever('compile:', chalk.blue(from));
    }
    return before.then(content => {
        return jsRequire.process({
            fileDeps: {},
            addWrapper: headers.addWrapper,
            checker: headers.checkerCfg,
            thisAlias: headers.thisAlias,
            to: to,
            loader: headers.loader || configs.loaderType,
            from: from,
            vendorCompile: originalContent != content,
            shortFrom: from.replace(configs.moduleIdRemovedPath, '').slice(1),
            content: content,
            isSnippet: headers.isSnippet,
            processContent: processContent
        });
    }).then(e => {
        let tmpl = e.addWrapper ? jsWrapper(e) : e.content;
        let ast;
        let comments = {};
        try {
            ast = acorn.parse(tmpl, {
                onComment(block, text, start, end) {
                    if (block) {
                        comments[start] = {
                            text: text.trim()
                        };
                        comments[end] = {
                            text: text.trim()
                        };
                    }
                }
            });
        } catch (ex) {
            slog.ever('parse js ast error:', chalk.red(ex.message));
            let arr = tmpl.split(lineBreakReg);
            let line = ex.loc.line - 1;
            if (arr[line]) {
                slog.ever('near code:', chalk.green(arr[line]));
            }
            slog.ever(chalk.red('js file: ' + e.from));
            return Promise.reject(ex);
        }
        let modifiers = [];
        let toTops = [];
        let toBottoms = [];
        let processString = (node, tl) => { //存储字符串，减少分析干扰
            if (!tl) {
                if (!stringReg.test(node.raw)) return;
            }
            let add = false;
            if (!configs.debug) {
                node.raw = node.raw.replace(revisableReg, m => {
                    add = true;
                    return md5(m, 'revisableString', configs.revisableStringPrefix);
                });
            }
            if (tl && node.raw == '@moduleId') {
                node.raw = e.moduleId;
                add = true;
            } else if (moduleIdReg.test(node.raw)) {
                node.raw = node.raw.replace(moduleIdReg, '$1' + e.moduleId + '$1');
                add = true;
            } else if (cssFileReg.test(node.raw) || configs.htmlFileReg.test(node.raw)) {
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
                let raw = node.raw;
                //字符串以@开头，且包含/
                let i = tl ? 0 : 1;
                if (raw.charAt(i) == '@' && raw.indexOf('/') > 0) {
                    //如果是2个@@开头则是转义
                    if (raw.charAt(i + 1) == '@' && raw.lastIndexOf('@') == i + 1) {
                        node.raw = raw.slice(0, i) + raw.slice(i + 1);
                        add = true;
                    } else if (raw.lastIndexOf('@') == i) { //只有一个，路径转换
                        if (tl) {
                            raw = '"' + raw + '"';
                        }
                        raw = atpath.resolvePath(raw, e.moduleId);
                        if (tl) {
                            raw = raw.slice(1, -1);
                        }
                        node.raw = raw;
                        add = true;
                    }
                }
            }
            if (add) {
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    content: node.raw
                });
            }
        };
        walker.simple(ast, {
            Property(node) {
                node = node.key;
                if (node.type == 'Literal') {
                    processString(node);
                }
            },
            Literal: processString,
            TemplateLiteral(node) {
                for (let q of node.quasis) {
                    q.raw = q.value.raw;
                    processString(q, true);
                }
            }
        });
        let walkerProcessor = checker.JS.getWalker(comments, tmpl, e);
        walker.simple(ast, walkerProcessor);
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
        if (e.addedWrapper) {
            let mxViews = e.tmplMxViewsArray || [];
            let reqs = [],
                vars = [];
            if (configs.tmplAddViewsToDependencies) {
                for (let v of mxViews) {
                    let i = v.indexOf('/');
                    let mName = i === -1 ? null : v.slice(0, i);
                    let p;
                    if (mName === e.pkgName) {
                        p = atpath.resolvePath('"@' + v + '"', e.moduleId);
                    } else {
                        p = `"${v}"`;
                    }
                    if (e.deps.indexOf(p) === -1) {
                        reqs.push(p);
                        vars.push('require(' + p + ');');
                    }
                }
            }
            reqs = reqs.join(',');
            if (e.requires.length && reqs) {
                reqs = ',' + reqs;
            }
            e.content = e.content.replace(e.requiresAnchorKey, reqs);
            e.content = e.content.replace(e.varsAnchorKey, vars.join('\r\n'));
        }
        return e;
    }).then(e => {
        if (headers.execAfterProcessor) {
            let processor = configs.compileAfterProcessor || configs.compileJSEnd;
            return processor(e);
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