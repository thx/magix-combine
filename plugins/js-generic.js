
let utils = require('./util');
let acorn = require('acorn');
let walker = require('acorn/dist/walk');

let stringReg = /^['"]/;
let qmap = {
    '\'': '&#39;',
    '"': '&#34;'
};
let qReg = /['"]/g;
let escapeQ = str => str.replace(qReg, m => qmap[m]);
module.exports = {
    escapeQ,
    pattern(fn, ast) {
        let modifiers = [];
        let map = Object.create(null);
        if (!ast) {
            ast = acorn.parse(fn);
        }
        let patternProcessor = node => {
            let values = [];
            let vd = node.type == 'VariableDeclarator';
            let left = vd ? node.id : node.left;
            let right = vd ? node.init : node.right;
            let init = right ? fn.slice(right.start, right.end) : '';
            if (left.type == 'ObjectPattern') {
                if (right.type != 'Identifier') {
                    let key = utils.uId('op_', fn);
                    values.push(`${vd ? '' : 'let '}${key}=${init}`);
                    init = key;
                }
                for (let p of left.properties) {
                    let v = p.key.type == 'Identifier' ? '.' + p.key.name : '[' + p.key.raw + ']';
                    values.push(`${p.value.name}=${init}${v}`);
                }
            } else if (left.type == 'ArrayPattern') {
                let index = 0;
                if (right.type != 'Identifier') {
                    let key = utils.uId('ap_', fn);
                    values.push(`${vd ? '' : 'let '}${key}=${init}`);
                    init = key;
                }
                for (let e of left.elements) {
                    values.push(`${e.name}=${init}[${index++}]`);
                }
            }
            if (values.length) {
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    content: (vd ? ' ' : '') + values.join(vd ? ',' : ';')
                });
            }
        };
        walker.simple(ast, {
            VariableDeclarator: patternProcessor,
            AssignmentExpression: patternProcessor
        });
        let update = false;
        if (modifiers.length) {
            update = true;
            modifiers.sort((a, b) => a.start - b.start);
            let ranges = [];
            for (let i = modifiers.length - 1, m, old, diff; i >= 0; i--) {
                m = modifiers[i];
                old = fn.slice(m.start, m.end);
                diff = m.content.length - old.length;
                ranges.push({
                    diff,
                    start: m.start,
                    end: m.start + m.content.length,
                    old
                });
                fn = fn.slice(0, m.start) + m.content + fn.slice(m.end);
            }
            let diffCount = 0;
            for (let r of ranges) {
                diffCount += r.diff;
                for (let i = r.start + diffCount; i < r.end + diffCount; i++) {
                    map[i] = r.old;
                }
            }
        }
        return { fn, update, map };
    },
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
    splitSafeguardExpr(expr) {
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
        walker.simple(ast, {
            Property(node) {
                let key = node.key;
                let value = node.value;
                if (key.type == 'Literal') {
                    processString(key);
                }
                if (value.type == 'Identifier' || value.type == 'MemberExpression') {
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