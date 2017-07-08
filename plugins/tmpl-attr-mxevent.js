//mx事件处理
let configs = require('./util-config');
let checker = require('./checker');
let slog = require('./util-log');
let attrObject = require('./tmpl-attr-object');
let tmplCmd = require('./tmpl-cmd');
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let tmplChecker = checker.Tmpl;
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%([=!])([\s\S]+?)%>/g;
let stringReg = /^['"]/;
let mxEventReg = /\bmx-(?!view|vframe|init|owner|autonomy|datafrom)([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
let magixHolder = '\u001e';
let holder = '\u001f';
let processQuot = (str, refTmplCommands, mxEvent, e) => {
    str.replace(cmdReg, cm => {
        let cmd = refTmplCommands[cm];
        if (cmd) {
            cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                tmplChecker.checkMxEventParamsUnescape(o, m, c, mxEvent, e);
                return '<%=$eq(' + c + ')%>';
            });
            refTmplCommands[cm] = cmd;
        }
    });
};
let cmdPHReg = /\u00aa\u00ff\d+\u00aa\u00ff/g;
let cmdKey = String.fromCharCode(0xaa, 0xff);
let encodeParams = (params, refTmplCommands, mxEvent, e) => {
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
        let add = false;
        if (stringReg.test(node.raw)) {
            let q = node.raw.charAt(0);
            let raw = node.raw.slice(1, -1);
            let eq = attrObject.escapeQ(raw, q);
            raw = raw.replace(cmdPHReg, m => store[m]);
            processQuot(raw, refTmplCommands, mxEvent, e);
            add = eq != raw;
            if (add) {
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    content: q + eq + q
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
        params = params.slice(0, m.start) + m.content + params.slice(m.end);
    }
    params = params.replace(cmdPHReg, m => store[m]);
    return params.slice(1, -1);
};
module.exports = (e, match, refTmplCommands) => {
    if (configs.addEventPrefix) { //增加事件前缀
        match = match.replace(mxEventReg, (m, name, double, single) => { //查找事件
            tmplChecker.checkMxEventName(name, e);
            if (double || single) {
                tmplChecker.checkMxEvengSingQuote(single, m, e);
                let left = m.indexOf('(');
                let right = m.indexOf(')');
                if (left > -1 && right > -1) {
                    let params = m.slice(left + 1, right).trim();
                    if (params) {
                        tmplChecker.checkMxEventParams(name, params, m, e);
                        params = encodeParams(params, refTmplCommands, tmplCmd.recover(m, refTmplCommands).replace(removeTempReg, ''), e);
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
            return m;
        });
    }
    return match;
};