/*
    js内容处理
    mx单文件转换->开始编译钩子(beforeProcessor,es6->es3)->js中的@规则识别及代码检查->处理样式->处理模板->处理js代码片断->编译结束钩子->缓存文件内容
 */
let util = require('util');
let chalk = require('chalk');
let fd = require('./util-fd');
let jsMx = require('./js-mx');
let jsDeps = require('./js-deps');
let cssProcessor = require('./css');
let tmplProcessor = require('./tmpl');
let atpath = require('./util-atpath');
let jsWrapper = require('./js-wrapper');
let configs = require('./util-config');
let checker = require('./checker');
let md5 = require('./util-md5');
let utils = require('./util');

let slog = require('./util-log');
let fileCache = require('./js-fcache');
let jsSnippet = require('./js-snippet');
let jsHeader = require('./js-header');
let acorn = require('./js-acorn');

let lineBreakReg = /\r\n?|\n|\u2028|\u2029/;
let mxTailReg = /\.mx$/;
let stringReg = /^['"]/;
//文件内容处理，主要是把各个处理模块串起来
let moduleIdReg = /^(['"])(@moduleId)\1$/;
let cssFileReg = /@(?:[\w\.\-\/\\]+?)\.(?:css|less|scss|sass|mx|style)/;
let cssFileGlobalReg = new RegExp(cssFileReg, 'g');
let othersFileReg = /(['"])([a-z,]+)?@([\w\.\-\/\\]+\.[a-z]{2,})\1;?/;
let revisableReg = /@\{[a-zA-Z\.0-9\-\~#_]+\}/g;
let doubleAtReg = /@@/g;
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
    let moduleId = utils.extractModuleId(from);
    let psychic = {
        fileDeps: {},
        to,
        from,
        moduleId,
        debug: configs.debug,
        content,
        pkgName: moduleId.slice(0, moduleId.indexOf('/')),
        moduleFileName: moduleId.substring(moduleId.lastIndexOf('/') + 1),
        shortFrom: from.replace(configs.moduleIdRemovedPath, '').substring(1),
        addWrapper: headers.addWrapper,
        checker: headers.checkerCfg,
        loader: headers.loader || configs.loaderType,
        isSnippet: headers.isSnippet,
        exRequires: headers.exRequires,
        processContent
    };
    psychic.exRequires.push(`"${moduleId}"`);
    //let originalContent = content;
    if (headers.execBeforeProcessor) {
        let processor = configs.compileBeforeProcessor || configs.compileJSStart;
        let result = processor(content, psychic);
        if (util.isString(result)) {
            before = Promise.resolve(result);
        } else if (result && util.isFunction(result.then)) {
            before = result;
        }
    }
    if (configs.log && inwatch) {
        slog.ever('compile:', chalk.blue(from));
    }
    return before.then(content => {
        if (util.isString(content)) {
            psychic.content = content;
        }
        return jsDeps.process(psychic);
    }).then(e => {
        if (headers.ignoreAllProcessor) {
            return Promise.resolve(e);
        }
        let tmpl = e.addWrapper ? jsWrapper(e) : e.content;
        let ast;
        let comments = {};
        try {
            ast = acorn.parse(tmpl, comments);
        } catch (ex) {
            slog.ever('parse js ast error:', chalk.red(ex.message), tmpl);
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
        //let tmplRanges = [];
        /*let tmplInRange = n => {
            let key = n.start + '~' + n.end;
            return tmplRanges[key] === 1;
            /*
            for (let r of tmplRanges) {
                if (r.start <= n.start && r.end >= n.end) {
                    return true;
                }
            }
            return false;*/
        //};
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
            let raw = node.raw;
            if (tl && raw == '@moduleId') {
                node.raw = e.moduleId;
                add = true;
            } else if (moduleIdReg.test(raw)) {
                node.raw = raw.replace(moduleIdReg, '$1' + e.moduleId + '$1');
                add = true;
            } else if (cssFileReg.test(raw)) {
                node.raw = raw.replace(cssFileGlobalReg, (m, offset) => {
                    let c = raw.charAt(offset - 1);
                    if (c == '@') return m.substring(1);
                    return m.replace('@', '\u0012@');
                }).replace(doubleAtReg, '@');
                add = true;
            } else if (configs.htmlFileReg.test(raw)) {
                node.raw = raw.replace(configs.htmlFileGlobalReg, (m, q, ctrl) => m.replace('@', (ctrl || 'updater') + '\u0012@'));
                add = true;
            } else if (othersFileReg.test(raw)) {
                let replacement = '';
                raw.replace(othersFileReg, (m, q, actions, file) => {
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
                        replacement = raw.replace(/@/g, '\u0012@');
                    }
                });
                node.raw = replacement;
                add = true;
            } else if (configs.useAtPathConverter) {
                //字符串以@开头，且包含/
                let i = tl ? 0 : 1;
                if (raw.charAt(i) == '@' && raw.indexOf('/') > 0) {
                    //如果是2个@@开头则是转义
                    if (raw.charAt(i + 1) == '@' && raw.lastIndexOf('@') == i + 1) {
                        node.raw = raw.substring(0, i) + raw.substring(i + 1);
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
            raw = node.raw.replace(doubleAtReg, '@');
            if (raw != node.raw) {
                node.raw = raw;
                add = true;
            }
            if (add) {
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    content: node.raw
                });
            }
        };
        /*acorn.walk(ast, {
            Property(node) {
                if (node.key.type == 'Identifier' && node.key.name == 'tmpl') {
                    let key = node.value.start + '~' + node.value.end;
                    tmplRanges[key] = 1;
                    tmplRanges.push({
                        start: node.value.start,
                        end: node.value.end
                    });
                }
            }/*,
            MethodDefinition(node) {
                if (node.kind == 'get' && node.key.name == 'tmpl') {
                    tmplRanges.push({
                        start: node.start,
                        end: node.end
                    });
                }
            }*/
        //});
        acorn.walk(ast, {
            Property(node) {
                if (node.key.type == 'Literal') {
                    processString(node.key);
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
        checker.JS.check(comments, tmpl, e, ast);
        modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
            return a.start - b.start;
        });
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            tmpl = tmpl.substring(0, m.start) + m.content + tmpl.substring(m.end);
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
        if (headers.ignoreAllProcessor) {
            return Promise.resolve(e);
        }
        if (contentInfo) e.contentInfo = contentInfo;
        return cssProcessor(e, inwatch);
    }).then(e => {
        if (headers.ignoreAllProcessor) {
            return Promise.resolve(e);
        }
        return tmplProcessor(e);
    }).then(e => {
        if (headers.ignoreAllProcessor) {
            return Promise.resolve(e);
        }
        return jsSnippet(e);
    }).then(e => {
        if (e.addedWrapper) {
            let mxViews = e.tmplMxViewsArray || [];
            let reqs = [],
                vars = [];
            if (configs.tmplAddViewsToDependencies) {
                for (let v of mxViews) {
                    let i = v.indexOf('/');
                    let mName = i === -1 ? null : v.substring(0, i);
                    let p, full;
                    if (mName === e.pkgName) {
                        p = atpath.resolvePath('"@' + v + '"', e.moduleId);
                    } else {
                        p = `"${v}"`;
                    }
                    full = atpath.resolvePath('"@' + p.slice(1, -1) + '"', e.moduleId);
                    let reqInfo = {
                        prefix: '',
                        tail: ';',
                        vId: '',
                        mId: p.slice(1, -1),
                        full: full,
                        from: 'view',
                        raw: 'mx-view="' + v + '"'
                    };
                    if (e.deps.indexOf(p) === -1 &&
                        e.deps.indexOf(reqInfo.full) === -1 &&
                        e.exRequires.indexOf(p) === -1 &&
                        e.exRequires.indexOf(reqInfo.full) == -1) {
                        if (e.loader == 'module') {
                            reqInfo.prefix = 'import ';
                            reqInfo.type = 'import';
                        } else {
                            reqInfo.type = 'require';
                        }
                        let replacement = jsDeps.getReqReplacement(reqInfo, e);
                        vars.push(replacement);
                        if (reqInfo.mId) {
                            let dId = JSON.stringify(reqInfo.mId);
                            reqs.push(dId);
                        }
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
        let after = Promise.resolve(e);
        if (headers.execAfterProcessor) {
            let processor = configs.compileAfterProcessor || configs.compileJSEnd;
            let result = processor(e.content, e);
            if (util.isString(result)) {
                e.content = result;
            } else if (result && util.isFunction(result.then)) {
                after = result.then(temp => {
                    if (util.isString(temp)) {
                        e.content = temp;
                        temp = e;
                    }
                    return Promise.resolve(temp);
                });
            }
        }
        return after;
    }).then(e => {
        fileCache.add(e.from, key, e);
        return e;
    });
};
module.exports = {
    process: processContent
};