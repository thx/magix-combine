let configs = require('./util-config');
let jsGeneric = require('./js-generic');
let eventLeftReg = /\(\s*\{/g;
let eventRightReg = /\}\s*\)/g;
let brReg = /(?:\r\n|\r|\n)/;
let openTag = '{{';
let mxEventHolderReg = /\x12([^\x12]+?)\x12/g;
let lineNoReg = /^\x1e(\d+)([\s\S]+)/;
let removeLineNoReg = /^\{\{\x1e\d+([\s\S]+)\}\}$/;
let extractAsExpr = expr => {
    expr = expr.trim();
    //解构
    if (expr.startsWith('{') || expr.startsWith('[')) {
        let stack = [],
            vars = '',
            key = '',
            last = '',
            first = '',
            pos = 0,
            bad = false;
        for (let i = 0; i < expr.length; i++) {
            let c = expr[i];
            if (pos == 0) {
                vars += c;
            } else if (pos == 1) {
                key += c;
            } else if (pos == 2) {
                last += c;
            } else if (pos == 3) {
                first += c;
            }
            if (c == '{' || c == '[') {
                stack.push(c);
            } else if (c == '}') {
                if (stack[stack.length - 1] == '{') {
                    stack.pop();
                } else {
                    bad = true;
                    break;
                }
            } else if (c == ']') {
                if (stack[stack.length - 1] == '[') {
                    stack.pop();
                } else {
                    bad = true;
                    break;
                }
            } else if (c == ' ' && !stack.length) {
                pos++;
            }
        }
        return {
            vars: vars.trim(),
            key: key.trim(),
            last: last.trim(),
            first: first.trim(),
            bad: bad || stack.length
        };
    }
    expr = expr.split(/\s+/);
    return {
        vars: expr[0],
        key: expr[1],
        last: expr[2],
        first: expr[3]
    };
};

let extractForExpr = expr => {
    expr = jsGeneric.trimParentheses(expr);
    let [init, test, update] = expr.split(';');
    return {
        init,
        test,
        update,
        expr
    };
};
module.exports = {
    extractAsExpr,
    extractForExpr,
    extractIfExpr: jsGeneric.trimParentheses,
    addLine(tmpl) {
        tmpl = tmpl.replace(configs.tmplMxEventReg, m => {
            let hasLeft = eventLeftReg.test(m);
            let hasRight = eventRightReg.test(m);
            return m.replace(eventLeftReg, hasRight ? '\x12' : '$&')
                .replace(eventRightReg, hasLeft ? '\x12' : '$&');
        });
        let lines = tmpl.split(brReg);
        let ls = [], lc = 0;
        for (let line of lines) {
            ls.push(line.split(openTag).join(openTag + '\x1e' + (++lc)));
        }
        tmpl = ls.join('\n');
        return tmpl;
    },
    extractArtInfo(art) {
        if (art.startsWith(openTag)) {
            art = art.substring(2, art.length - 2);
        }
        let m = art.match(lineNoReg);
        if (m) {
            art = m[2].trimLeft();
            if (art.startsWith('if(')) {
                art = art.substring(0, 2) + ' ' + art.substring(2);
            } else if (art.startsWith('for(')) {
                art = art.substring(0, 3) + ' ' + art.substring(3);
            }
            let ctrls = art.split(/\s+/).slice(0, 2);
            return {
                line: m[1],
                art,
                ctrls
            };
        }
        return null;
    },
    removeLine(ctrl) {
        return ctrl.replace(removeLineNoReg, '{{$1}}');
    },
    recoverEvent(tmpl) {
        return tmpl.replace(mxEventHolderReg, '({$1})');
    }
};