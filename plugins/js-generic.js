
//let utils = require('./util');

let acorn = require('./js-acorn');

let stringReg = /^['"]/;
let qmap = {
    '\'': '&#39;',
    '"': '&#34;'
};
let qReg = /['"]/g;
let escapeQ = str => str.replace(qReg, m => qmap[m]);
module.exports = {
    escapeQ,
    splitExpr(expr) { //拆分表达式，如"list[i].name[object[key[value]]]" => ["list", "[i]", "name", "[object[key[value]]]"]
        let stack = [];
        let temp = '';
        let max = expr.length;
        let i = 0,
            c, opened = 0;
        while (i < max) {
            c = expr.charAt(i);
            if (c == '.') {
                if (!opened) {
                    if (temp) {
                        stack.push(temp);
                    }
                    temp = '';
                } else {
                    temp += c;
                }
            } else if (c == '[') {
                if (!opened && temp) {
                    stack.push(temp);
                    temp = '';
                }
                opened++;
                temp += c;
            } else if (c == ']') {
                opened--;
                temp += c;
                if (!opened && temp) {
                    stack.push(temp);
                    temp = '';
                }
            } else {
                temp += c;
            }
            i++;
        }
        if (temp) {
            stack.push(temp);
        }
        return stack;
    },
    splitSafeguardExpr(expr) {//拆分  a[b&&b[c]] && a[b&&b[c]].d => [ a[b&&b[c]] ,a[b&&b[c]].d ]
        let stack = [];
        let temp = '';
        let max = expr.length;
        let i = 0,
            c, opened = 0;
        while (i < max) {
            c = expr.charAt(i);
            if (c == '&' && expr.charAt(i + 1) == '&' && !opened && temp) {
                stack.push(temp);
                temp = '';
                i++;
            } else {
                if (c == '[') {
                    opened++;
                } else if (c == ']') {
                    opened--;
                }
                temp += c;
            }
            i++;
        }
        if (temp) {
            stack.push(temp);
        }
        return stack;
    },
    parseObject(str, startChar, endChar) {
        str = '(' + str.trim() + ')';
        let ast = acorn.parse(str);
        let modifiers = [];
        let processString = node => {
            if (stringReg.test(node.raw)) {
                let q = node.raw.charAt(0);
                let value = node.raw.slice(1, -1);
                if (q == '"') {
                    q = '\'';
                    value = value.replace(/'/g, '\\\'');
                }
                value = escapeQ(value);
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    value: q + value + q
                });
            }
        };
        let processIdAndME = node => {
            let value = node.value;
            let key = node.key;
            let oValue = str.slice(value.start, value.end);
            if (node.shorthand) {
                modifiers.push({
                    start: node.end,
                    end: node.end,
                    value: ':' + endChar + '",' + oValue + ',"' + startChar
                });
            } else if (node.computed) {
                modifiers.push({
                    start: key.start - 1,
                    end: key.end + 1,
                    value: endChar + '",' + str.slice(key.start, key.end) + ',"' + startChar
                }, {
                        start: value.start,
                        end: value.end,
                        value: endChar + '",' + oValue + ',"' + startChar
                    });
            } else {
                modifiers.push({
                    start: value.start,
                    end: value.end,
                    value: endChar + '",' + oValue + ',"' + startChar
                });
            }
        };
        acorn.walk(ast, {
            Property(node) {
                let key = node.key;
                let value = node.value;
                if (key.type == 'Literal') {
                    processString(key);
                }
                let oValue = str.slice(value.start, value.end);
                if (node.shorthand) {
                    modifiers.push({
                        start: node.end,
                        end: node.end,
                        value: ':' + endChar + '",' + oValue + ',"' + startChar
                    });
                } else if (node.computed) {
                    modifiers.push({
                        start: key.start - 1,
                        end: key.end + 1,
                        value: endChar + '",' + str.slice(key.start, key.end) + ',"' + startChar
                    });
                } else if (value.type == 'Identifier' ||
                    value.type == 'MemberExpression') {
                    modifiers.push({
                        start: value.start,
                        end: value.end,
                        value: endChar + '",' + oValue + ',"' + startChar
                    });
                }
            },
            ArrayExpression(node) {
                for (let e of node.elements) {
                    if (e.type == 'Identifier' ||
                        e.type == 'MemberExpression') {
                        let oValue = str.slice(e.start, e.end);
                        modifiers.push({
                            start: e.start,
                            end: e.end,
                            value: endChar + '",' + oValue + ',"' + startChar
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
            str = str.slice(0, m.start) + m.value + str.slice(m.end);
        }
        return '"' + startChar + str.slice(1, -1) + '"';
    }
};