/*
    mx事件处理
    1.　检测是否按要求书写的事件
    2.　检测单双引号的实体转义
    3.　检测不支持的写法
 */
let chalk = require('chalk');
let configs = require('./util-config');
let checker = require('./checker');
let slog = require('./util-log');
let utils = require('./util');
let jsGeneric = require('./js-generic');
let tmplCmd = require('./tmpl-cmd');
//let md5 = require('./util-md5');
//let regexp = require('./util-rcache');
let acorn = require('./js-acorn');
let tmplChecker = checker.Tmpl;
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
let cmdReg = /\u0007\d+\u0007/g;
let onlyCmdReg = /^(?:\u0007\d+\u0007)+$/;
let dOutCmdReg = /<%([=!@])([\s\S]+?)%>/g;
let unsupportOutCmdReg = /<%@[\s\S]+?%>/g;
let stringReg = /^['"]/;
let magixHolder = '\u001e';
let holder = '\u001f';
//let revisableReg = /@\{[^\{\}]+\}/g;
//let eventPrefixReg = /^[^\(\)]+/;
let processQuot = (str, refTmplCommands, mxEvent, e, toSrc) => {
    str.replace(cmdReg, cm => {
        let cmd = refTmplCommands[cm];
        if (cmd) {
            cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                if (!onlyCmdReg.test(str)) {
                    tmplChecker.checkMxEventParamsCMD(o, mxEvent, e, toSrc(str));
                }
                if (o == '=') {
                    return '<%=$eq(' + c + ')%>';
                }
                return m;
            });
            refTmplCommands[cm] = cmd;
        }
    });
};
let htmlQEntityReg = /(\\*)(&quot;?|&#x22;?|&#x27;?|&#34;?|&#39;?)/g;
let encodeParams = (params, refTmplCommands, mxEvent, e, toSrc) => {
    let index = 0;
    let store = Object.create(null);
    let cmdKey = utils.uId('\u00aa', params);
    let cmdPHReg = new RegExp(cmdKey + '\\d+' + cmdKey, 'g');
    //console.log(JSON.stringify(params));
    params = '(' + params.replace(cmdReg, m => {
        let k = cmdKey + index++ + cmdKey;
        store[k] = m;
        return k;
    }) + ')';
    //console.log(JSON.stringify(params));
    let ast;
    try {
        ast = acorn.parse(params);
    } catch (ex) {
        let origin = params.substring(1, params.length - 1).replace(cmdPHReg, m => store[m]).replace(cmdReg, m => refTmplCommands[m]);
        let src = toSrc(origin);
        slog.ever(chalk.red('encode mx-event params error'), 'origin', chalk.magenta(src), (src != origin ? 'translate to ' + chalk.magenta(origin) : ''), chalk.red('mx-event params with template syntax must be a legal object literal'), 'e.g.', chalk.magenta('{id:{{=id}},name:\'{{if gender==\'male\'}}David{{else}}Lily{{/if}}\'}'));
        throw ex;
    }
    let modifiers = [];
    let processString = node => { //存储字符串，减少分析干扰
        if (stringReg.test(node.raw)) {
            let q = node.raw.charAt(0);
            let raw = node.raw.slice(1, -1);
            let replacement = raw.replace(htmlQEntityReg, (m, s, n) => {
                return s && s.length % 2 ? m : s + '\\' + n;
            });
            if (raw != replacement) {
                let tip = replacement
                    .replace(cmdPHReg, m => store[m])
                    .replace(cmdReg, m => refTmplCommands[m])
                    .replace(removeTempReg, '');

                let tipRaw = raw
                    .replace(cmdPHReg, m => store[m])
                    .replace(cmdReg, m => refTmplCommands[m])
                    .replace(removeTempReg, '');

                slog.ever(chalk.red('beware!'), 'You should use', chalk.magenta(tip), 'instead of', chalk.magenta(tipRaw), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent.replace(removeTempReg, '')));
            }
            let eq = jsGeneric.escapeQ(replacement, q);
            replacement = replacement.replace(cmdPHReg, m => store[m]);
            processQuot(replacement, refTmplCommands, mxEvent, e, toSrc);
            modifiers.push({
                start: node.start,
                end: node.end,
                content: q + eq + q
            });
        }
    };
    acorn.walk(ast, {
        Property(node) {
            let key = node.key;
            if (key.type == 'Literal') {
                processString(key);
            }
            let value = node.value;
            if (value.type == 'Identifier') {
                let cmd = value.name.replace(cmdPHReg, m => store[m]);
                if (onlyCmdReg.test(cmd)) {
                    cmd = tmplCmd.recover(cmd, refTmplCommands);
                    let modify = false;
                    cmd.replace(dOutCmdReg, (m, o) => {
                        modify = o == '@';
                    });
                    if (modify) {
                        modifiers.push({
                            start: value.start,
                            end: value.end,
                            content: '\'' + value.name + '\''
                        });
                    }
                } else {
                    cmd.replace(cmdReg, cm => {
                        let oCmd = refTmplCommands[cm];
                        if (oCmd) {
                            oCmd.replace(unsupportOutCmdReg, m => {
                                m = m.replace(removeTempReg, '');
                                slog.ever(chalk.red('unsupport ' + m), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent.replace(removeTempReg, '')));
                            });
                        }
                    });
                }
            }
        },
        Literal: processString
    });
    modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
        return a.start - b.start;
    });
    for (let i = modifiers.length - 1, m; i >= 0; i--) {
        m = modifiers[i];
        params = params.substring(0, m.start) + m.content + params.substring(m.end);
    }
    params = params.replace(cmdPHReg, m => store[m]);
    return params.slice(1, -1);
};
module.exports = (e, match, refTmplCommands, toSrc) => {
    if (!configs.disableMagixUpdater) { //增加事件前缀
        match = match.replace(configs.tmplMxEventReg, (m, name, double, single) => { //查找事件
            tmplChecker.checkMxEventName(name, e);
            if (double || single) {
                let originalMatch = toSrc(m);
                tmplChecker.checkMxEvengSingQuote(single, originalMatch, e);
                // m = m.replace(eventPrefixReg, match => {
                //     return match.replace(revisableReg, c => {
                //         tmplChecker.checkMxEventStringRevisable(c, originalMatch, e);
                //         if (configs.debug) {
                //             return c;
                //         }
                //         return md5(c, 'revisableString', configs.revisableStringPrefix);
                //     });
                // });
                let left = m.indexOf('(');
                let right = m.lastIndexOf(')');
                if (left > -1 && right > -1 && right > left) {
                    let params = m.substring(left + 1, right).trim();
                    left = m.substring(0, left + 1);
                    right = m.substring(right);
                    //console.log(cmdReg.test(left), left, right);
                    if (cmdReg.test(left) || cmdReg.test(right)) {
                        right = params + right;
                    } else if (params) {
                        tmplChecker.checkMxEventParams(name, params, originalMatch, e);
                        right = encodeParams(params, refTmplCommands, originalMatch, e, toSrc) + right;
                    }
                    let start = left.indexOf('=');
                    let c;
                    do {
                        c = left.charAt(start);
                        start++;
                    } while (c != '"' && c != '\'');
                    let rest = left.substring(start) + right;
                    return left.substring(0, start) + holder + magixHolder + rest;
                } else {
                    return m;
                }
            }
            return m;
        });
    }
    return match;
};