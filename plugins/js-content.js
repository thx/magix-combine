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
let jsBare = require('./js-bare');
let jsHeader = require('./js-header');
let acorn = require('./js-acorn');
let consts = require('./util-const');

let lineBreakReg = /\r\n?|\n|\u2028|\u2029/;
let mxTailReg = /\.m?mx$/;
let stringReg = /^['"]/;
//文件内容处理，主要是把各个处理模块串起来
let moduleIdReg = /@(?:moduleId|id)/;
let bareFileInc = /bare@([\w\.\-\/\\]+)/;
let cssFileReg = /@(?:[\w\.\-\/\\]+?)\.(?:css|less|mx|style)/;
let cssFileGlobalReg = new RegExp(cssFileReg, 'g');
let othersFileReg = /([a-z,&]+)?@([\w\.\-\/\\]+\.[a-z]{2,})/;
let doubleAtReg = /@@/g;
/*
    '#snippet';
    '#exclude(define,beforeProcessor,after)';
 */
let processContent = (from, to, content, inwatch, parentCtrl) => {
    if (!content) content = fd.read(from);
    let contentInfo;
    if (mxTailReg.test(from)) {
        contentInfo = jsMx.process(content, from);
        content = contentInfo.script;
    }

    let headers = jsHeader(content);
    if (parentCtrl) {
        if (parentCtrl.raw) {
            headers.addWrapper = false;
            headers.ignoreAllProcessor = true;
        }
        if (parentCtrl.snippet) {
            headers.isSnippet = true;
        }
    }
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
        noRequires: headers.noRequires,
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
        slog.ever('[MXC Tip(js-content)] compile:', chalk.blue(from));
    }
    return before.then(content => {
        if (util.isString(content)) {
            psychic.content = content;
        }
        return jsDeps.process(psychic);
    }).then(e => {
        let newRequires = [];
        if (!e.noRequires) {
            for (let i = e.requires.length; i--;) {
                let req = e.requires[i];
                if (req.charAt(1) == '@' && req.indexOf('/') > 0) {
                    if (req.charAt(2) == '@' && req.lastIndexOf('@') == 2) {
                        e.requires[i] = req.substring(0, 1) + req.substring(2);
                    } else if (req.lastIndexOf('@') == 1) {
                        e.requires[i] = atpath.resolvePath(req, e.moduleId);
                    }
                }
                req = e.requires[i];
                req = req.substring(1, req.length - 1);
                let idx = req.indexOf('/');
                let mName = idx === -1 ? null : req.substring(0, idx);
                let p, full;
                if (mName === e.pkgName) {
                    p = atpath.resolvePath(`"@${req}"`, e.moduleId);
                } else {
                    p = `"${req}"`;
                }
                full = atpath.resolvePath('"@' + p.slice(1, -1) + '"', e.moduleId);
                if (e.exRequires.indexOf(p) == -1 &&
                    e.exRequires.indexOf(full) == -1) {
                    newRequires.push(`"${req}"`);
                }
            }
        }
        e.requires.length = 0;
        e.requires.push(...newRequires.reverse());
        return Promise.resolve(e);
    }).then(e => {
        if (headers.ignoreAllProcessor) {
            return Promise.resolve(e);
        }
        let tmpl = e.addWrapper ? jsWrapper(e) : e.content;
        let ast;
        let comments = {};
        try {
            ast = acorn.parse(tmpl, comments, e.from);
        } catch (ex) {
            let msg = [chalk.red(`[MXC Error(js-content)]`), 'Parse js ast error:', chalk.red(ex.message), tmpl];
            let arr = tmpl.split(lineBreakReg);
            let line = ex.loc.line - 1;
            if (arr[line]) {
                msg.push('near code:', chalk.green(arr[line]));
            }
            msg.push(chalk.red('js file: ' + e.from));
            slog.ever.apply(slog, msg);
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
            let raw = node.raw;
            if (!configs.debug) {
                node.raw = raw.replace(consts.revisableGReg, m => {
                    add = true;
                    return md5(m, 'revisableString', configs.revisableStringPrefix);
                });
            }
            if (moduleIdReg.test(raw)) {
                let m = raw.match(moduleIdReg);
                let c = raw[0] + m[0] + raw[0];
                if (tl || c == raw) {
                    raw = tl ? e.moduleId : raw[0] + e.moduleId + raw[0];
                    node.raw = raw;
                    add = true;
                }
            } else if (bareFileInc.test(raw)) {
                let m = raw.match(bareFileInc);
                let c = raw[0] + m[0] + raw[0];
                if (tl || c == raw) {
                    node.raw = raw.replace('@', '\x12@');
                    add = true;
                }
            } else if (cssFileReg.test(raw)) {
                node.raw = raw.replace(cssFileGlobalReg, (m, offset) => {
                    let c = raw.charAt(offset - 1);
                    if (c == '@') return m.substring(1);
                    return m.replace('@', '\u0012@');
                }).replace(doubleAtReg, '@');
                add = true;
            } else if (configs.htmlFileReg.test(raw)) {
                let m = raw.match(configs.htmlFileReg);
                let c = raw[0] + m[0] + raw[0];
                if (tl || c == raw) {
                    node.raw = raw.replace(configs.htmlFileGlobalReg, (m, ctrl) => {
                        return m.replace('@', (ctrl ? '' : 'updater') + '\x12@');
                    });
                    add = true;
                }
            } else if (othersFileReg.test(raw)) {
                let m = raw.match(othersFileReg);
                let c = raw[0] + m[0] + raw[0];
                if (tl || c == raw) {
                    let replacement = '';
                    raw.replace(othersFileReg, (m, actions, file) => {
                        if (actions) {
                            actions = actions.split(',');
                            let acts = '', toTop = false, toBottom = false;
                            for (let a of actions) {
                                if (a == 'top') {
                                    if (!toBottom) {
                                        toTop = true;
                                    }
                                } else if (a == 'bottom') {
                                    if (!toTop) {
                                        toBottom = true;
                                    }
                                } else {
                                    acts += a + ',';
                                }
                            }

                            replacement = JSON.stringify(acts.slice(0, -1) + '\@' + file).replace('@', '\x12@');
                            if (toTop) {
                                toTops.push(replacement);
                                replacement = '';
                                if (tl) {
                                    node.start--;
                                    node.end++;
                                }
                            } else if (toBottom) {
                                toBottoms.push(replacement);
                                replacement = '';
                                if (tl) {
                                    node.start--;
                                    node.end++;
                                }
                            }
                        } else {
                            replacement = raw.replace(/@/g, '\u0012@');
                        }
                    });
                    node.raw = replacement;
                    add = true;
                }
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
        if (configs.debug) {
            checker.JS.check(comments, tmpl, e, ast);
        }
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
        return jsBare(e);
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

            if (!configs.tmplAddViewsToDependencies) mxViews = [];
            mxViews = mxViews.concat(e.tmplComponents || []);
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
            reqs = reqs.join(',');
            if (e.requires.length && reqs) {
                reqs = ',' + reqs;
            }
            e.content = e.content.replace(e.requiresAnchorKey, reqs);
            e.content = e.content.replace(e.varsAnchorKey, vars.join('\r\n'));
        }
        return e;
    })/*.then(e => {
        let tmpl = e.content;
        let modifiers = [];
        try {
            ast = acorn.parse(tmpl, null, e.from);
        } catch (ex) {
            let msg = [chalk.red(`[MXC Error(js-content)]`), 'Parse js ast error:', chalk.red(ex.message), tmpl];
            let arr = tmpl.split(lineBreakReg);
            let line = ex.loc.line - 1;
            if (arr[line]) {
                msg.push('near code:', chalk.green(arr[line]));
            }
            msg.push(chalk.red('js file: ' + e.from));
            slog.ever.apply(slog, msg);
            return Promise.reject(ex);
        }
        let processString = node => {
            let raw = node.raw,
                add = false;
            raw = raw.replace(/@css:.?([\w\-:]+)/g, (_, key) => {
                return e.cssNamesMap[key] || 'unfound-[' + key + ']';
            });
            if (raw != node.raw) {
                node.raw = raw;
                add = true;
            }
            if (add) {
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    content: raw
                });
            }
        };
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
        modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
            return a.start - b.start;
        });
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            tmpl = tmpl.substring(0, m.start) + m.content + tmpl.substring(m.end);
        }
        e.content = tmpl;
        return e;
    })*/.then(e => {
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