/*
    mx事件处理
    1.　检测是否按要求书写的事件
    2.　检测单双引号的实体转义
    3.　检测不支持的写法
 */
let configs = require('./util-config');
let checker = require('./checker');
let slog = require('./util-log');
let attrObject = require('./tmpl-attr-object');
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let tmplChecker = checker.Tmpl;
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%([=!@])([\s\S]+?)%>/g;
let unsupportOutCmdReg = /<%@[\s\S]+?%>/g;
let stringReg = /^['"]/;
let mxEventReg = /\bmx-(?!view|vframe|init|owner|autonomy|datafrom|guid)([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
let magixHolder = '\u001e';
let holder = '\u001f';
let processQuot = (str, refTmplCommands, mxEvent, e, toSrc) => {
    str.replace(cmdReg, cm => {
        let cmd = refTmplCommands[cm];
        if (cmd) {
            cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                tmplChecker.checkMxEventParamsCMD(o, toSrc(m), toSrc(c), mxEvent, e);
                if (o == '=') {
                    return '<%=$eq(' + c + ')%>';
                }
                return m;
            });
            refTmplCommands[cm] = cmd;
        }
    });
};
let cmdPHReg = /\u00aa\u00ff\d+\u00aa\u00ff/g;
let htmlQEntityReg = /(\\*)(&quot;?|&#x22;?|&#x27;?|&#34;?|&#39;?)/g;
let cmdKey = String.fromCharCode(0xaa, 0xff);
let encodeParams = (params, refTmplCommands, mxEvent, e, toSrc) => {
    let index = 0;
    let store = Object.create(null);
    params = '(' + params.replace(cmdReg, m => {
        let k = cmdKey + index++ + cmdKey;
        store[k] = m;
        return k;
    }) + ')';
    let ast = acorn.parse(params);
    let modifiers = [];
    let processString = node => { //存储字符串，减少分析干扰
        stringReg.lastIndex = 0;
        if (stringReg.test(node.raw)) {
            let q = node.raw.charAt(0);
            let raw = node.raw.slice(1, -1);
            let replacement = raw.replace(htmlQEntityReg, (m, s, n) => {
                return s && s.length % 2 ? m : s + '\\' + n;
            });
            if (raw != replacement) {
                slog.ever('beware!'.red, 'You should use', replacement.magenta, 'instead of', raw.magenta, 'at', e.shortHTMLFile.gray, 'in', mxEvent.replace(removeTempReg, '').magenta);
            }
            let eq = attrObject.escapeQ(replacement, q);
            replacement = replacement.replace(cmdPHReg, m => store[m]);
            processQuot(replacement, refTmplCommands, mxEvent, e, toSrc);
            modifiers.push({
                start: node.start,
                end: node.end,
                content: q + eq + q
            });
        }
    };
    walker.simple(ast, {
        Property(node) {
            let key = node.key;
            if (key.type == 'Literal') {
                processString(key);
            }
            let value = node.value;
            if (value.type == 'Identifier') {
                let cmd = value.name.replace(cmdPHReg, m => store[m]);
                cmd.replace(cmdReg, cm => {
                    let oCmd = refTmplCommands[cm];
                    if (oCmd) {
                        oCmd.replace(unsupportOutCmdReg, m => {
                            m = m.replace(removeTempReg, '');
                            slog.ever(('unsupport ' + m).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.replace(removeTempReg, '').magenta);
                        });
                    }
                });
            }
        },
        Literal: processString
    });
    modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
        return a.start - b.start;
    });
    for (let i = modifiers.length - 1, m; i >= 0; i--) {
        m = modifiers[i];
        params = params.slice(0, m.start) + m.content + params.slice(m.end);
    }
    params = params.replace(cmdPHReg, m => store[m]);
    return params.slice(1, -1);
};
module.exports = (e, match, refTmplCommands, toSrc) => {
    if (configs.addEventPrefix) { //增加事件前缀
        match = match.replace(mxEventReg, (m, name, double, single) => { //查找事件
            tmplChecker.checkMxEventName(name, e);
            if (double || single) {
                let originalMatch = toSrc(m);
                tmplChecker.checkMxEvengSingQuote(single, originalMatch, e);
                if (configs.disableMagixUpdater) {
                    let left = m.indexOf('=');
                    let idx = left;
                    do {
                        idx++;
                        let c = m.charAt(idx);
                        if (c != ' ' && c != '"' && c != '\'') {
                            break;
                        }
                    } while (idx < m.length);
                    return m.slice(0, idx) + holder + magixHolder + m.slice(idx);
                } else {
                    let left = m.indexOf('(');
                    let right = m.indexOf(')');
                    if (left > -1 && right > -1) {
                        let params = m.slice(left + 1, right).trim();
                        if (params) {
                            tmplChecker.checkMxEventParams(name, params, originalMatch, e);
                            params = encodeParams(params, refTmplCommands, originalMatch, e, toSrc);
                        }
                        left = m.slice(0, left + 1);
                        right = (params || '') + m.slice(right);
                    } else {
                        slog.ever(('bad event:' + m).red, 'at', e.shortHTMLFile.gray);
                        left = m;
                        right = '';
                    }
                    let start = left.indexOf('=');
                    let c;
                    do {
                        c = left.charAt(start);
                        start++;
                    } while (c != '"' && c != '\'');
                    return left.slice(0, start) + holder + magixHolder + left.slice(start) + right;
                }
            }
            return m;
        });
    }
    return match;
};