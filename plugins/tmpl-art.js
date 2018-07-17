/*
https://github.com/aui/art-template
https://thx.github.io/crox/
在artTemplate的基础上演化而来
*/

/*
详细文档及讨论地址：https://github.com/thx/magix-combine/issues/27

输出语句
    {{=variable}} //转义输出
    {{!variable}} //直接输出
    {{@variable}} //在渲染组件时传递数据
    {{:variable}} //绑定表达式
判断语句
    //if

    {{if user.age > 20}}
        <span>{{= user.name }}</span>
    {{/if}}

    //if else

    {{if user.age > 20}}
        <span>{{= user.name }}</span>
    {{else if user.age < 10}}
        <strong>{{= user.name }}</strong>
    {{/if}}

循环语句
    //array and key value
    {{each list as value index}}
        {{= index }}:{{= value }}
    {{/each}}

    //object and key value

    {{forin list as value key}}
        {{= key }}:{{= value }}
    {{/forin}}

    //通用for
    {{for(let i=0;i<10;i++)}}
        {{=i}}
    {{/for}}

方法调用

    {{= fn(variable,variable1) }}

变量声明及其它

    {{ let a=user.name,b=30,c={} }}
*/
let utils = require('./util');
let configs = require('./util-config');
let slog = require('./util-log');
let chalk = require('chalk');
let artExpr = require('./tmpl-art-ctrl');
let slashReg = /\\|'/g;
let ifForReg = /^\s*(if|for)\s*\(/;
let longExpr = /[\.\[\]]/;
let lineBreakReg = /\r\n?|\n|\u2028|\u2029/g;
let openTag = '{{';
let ctrls = {
    'if'(stack, ln) {
        stack.push({
            ctrl: 'if', ln
        });
    },
    'else'(stack) {
        let last = stack[stack.length - 1];
        if (last) {
            if (last.ctrl !== 'if') {
                return last;
            }
        } else {
            return {
                ctrl: ''
            };
        }
    },
    '/if'(stack) {
        let last = stack.pop();
        if (last) {
            if (last.ctrl != 'if') {
                return last;
            }
        } else {
            return {
                ctrl: ''
            };
        }
    },
    'each'(stack, ln) {
        stack.push({ ctrl: 'each', ln });
    },
    '/each'(stack) {
        let last = stack.pop();
        if (last) {
            if (last.ctrl != 'each') {
                return last;
            }
        } else {
            return {
                ctrl: ''
            };
        }
    },
    'forin'(stack, ln) {
        stack.push({ ctrl: 'forin', ln });
    },
    '/forin'(stack) {
        let last = stack.pop();
        if (last) {
            if (last.ctrl != 'forin') {
                return last;
            }
        } else {
            return {
                ctrl: ''
            };
        }
    },
    'for'(stack, ln) {
        stack.push({ ctrl: 'for', ln });
    },
    '/for'(stack) {
        let last = stack.pop();
        if (last) {
            if (last.ctrl != 'for') {
                return last;
            }
        } else {
            return {
                ctrl: ''
            };
        }
    }
};
let checkStack = (stack, key, code, e, lineNo) => {
    let ctrl = ctrls[key];
    if (ctrl) {
        let l = ctrl(stack, lineNo);
        if (l) {
            let args = [chalk.red(`unexpected {{${code}}} at line:${lineNo}`)];
            if (l.ctrl) {
                args.push('unclosed', chalk.magenta(l.ctrl), `at line:${l.ln} , at file`);
            } else {
                args.push('at file');
            }
            args.push(chalk.grey(e.shortHTMLFile));
            slog.ever.apply(slog, args);
            throw new Error(`unexpected ${code}`);
        }
    } else if (stack.length) {
        for (let s, i = stack.length; i--;) {
            s = stack[i];
            slog.ever(chalk.red(`unclosed ${s.ctrl} at line:${s.ln}`), ', at file', chalk.grey(e.shortHTMLFile));
        }
        throw new Error(`unclosed art ctrls at ${e.shortHTMLFile}`);
    }
};
let syntax = (code, stack, e, lineNo) => {
    code = code.trim();
    let ctrls, partial;
    let temp = ifForReg.exec(code);
    if (temp) {
        partial = '(' + code.substring(temp[0].length);
        ctrls = [temp[1], partial];
    } else {
        ctrls = code.split(/\s+/);
    }
    let key = ctrls.shift();
    let src = '';
    if (configs.debug) {
        src = `<%'${lineNo}\x11${code.replace(slashReg, '\\$&')
            .replace(lineBreakReg, '\\n')}\x11'%>`;
    }
    if (key == 'if') {
        checkStack(stack, key, code, e, lineNo);
        let expr = ctrls.join(' ');
        expr = expr.trim();
        expr = artExpr.extractIfExpr(expr);
        return `${src}<%if(${expr}){%>`;
    } else if (key == 'else') {
        checkStack(stack, key, code, e, lineNo);
        let iv = '';
        if (ctrls.shift() == 'if') {
            let expr = ctrls.join(' ');
            expr = artExpr.extractIfExpr(expr);
            iv = ` if(${expr})`;
        }
        return `${src}<%}else${iv}{%>`;
    } else if (key == 'each') {
        checkStack(stack, key, code, e, lineNo);
        let object = ctrls[0],
            asExpr,
            init = false;
        if (ctrls.length == 1) {
            asExpr = {};
            ctrls[1] = 'as';
        } else {
            let asValue = ctrls.slice(2).join(' ');
            asExpr = artExpr.extractAsExpr(asValue);
            init = true;
        }
        if (asExpr.bad || ctrls[1] != 'as') {
            slog.ever(chalk.red(`unsupport or bad each {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport or bad each {{' + code + '}}');
        }
        let index = asExpr.key || utils.uId('$art_i', code);
        let refObj = longExpr.test(object) ? utils.uId('$art_obj', code) : object;
        let value = init ? `let ${asExpr.vars}=${refObj}[${index}]` : '';
        let refExpr = longExpr.test(object) ? `,${refObj}=${object}` : '';
        let refObjCount = utils.uId(`$art_c`, code);
        let firstAndLast = '';
        let lastCount = '';
        let lastCountObj = utils.uId(`$art_lc`, code);
        if (asExpr.last || asExpr.first) {
            if (asExpr.first) {
                firstAndLast += `let ${asExpr.first}=${index}===0;`;
            }
            if (asExpr.last) {
                lastCount = `,${lastCountObj}=${refObjCount}-1`;
                firstAndLast += `let ${asExpr.last}=${index}===${lastCountObj};`;
            }
        }
        return `${src}<%for(let ${index}=0${refExpr},${refObjCount}=${refObj}.length${lastCount};${index}<${refObjCount};${index}++){${firstAndLast}${value}%>`;
    } else if (key == 'forin') {
        checkStack(stack, key, code, e, lineNo);
        let object = ctrls[0], asExpr,
            init = false;
        if (ctrls.length == 1) {
            asExpr = {};
            ctrls[1] = 'as';
        } else {
            let asValue = ctrls.slice(2).join(' ');
            asExpr = artExpr.extractAsExpr(asValue);
            init = true;
        }
        if (asExpr.bad || ctrls[1] != 'as') {
            slog.ever(chalk.red(`unsupport or bad forin {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport or bad forin {{' + code + '}}');
        }
        let key1 = asExpr.key || utils.uId('$art_k', code);
        let refObj = longExpr.test(object) ? utils.uId('$art_obj', code) : object;
        let value = init ? `let ${asExpr.vars}=${refObj}[${key1}]` : '';
        let refExpr = longExpr.test(object) ? `let ${refObj}=${object};` : '';
        return `${src}<%${refExpr}for(let ${key1} in ${refObj}){${value}%>`;
    } else if (key == 'for') {
        checkStack(stack, key, code, e, lineNo);
        let expr = ctrls.join(' ').trim();
        let fi = artExpr.extractForExpr(expr);
        return `${src}<%for(${fi.expr}){%>`;
    } else if (key == 'set') {
        return `${src}<%let ${ctrls.join(' ')};%>`;
    } else if (key == '/if' ||
        key == '/each' ||
        key == '/forin' ||
        key == '/for') {
        checkStack(stack, key, code, e, lineNo);
        return `${src}<%}%>`;
    } else {
        return `${src}<%${code}%>`;
    }
};
let findBestCode = (str, e, line) => {
    let left = '',
        right = '';
    let leftCount = 0,
        rightCount = 0,
        maybeCount = 0,//maybe是兼容以前正则的逻辑 /\}{2}(?!\})/
        maybeAt = -1,
        find = false;
    for (let i = 0; i < str.length; i++) {
        let c = str.charAt(i);
        if (c != '}') {
            if (maybeCount >= 2 && maybeAt == -1) {
                maybeAt = i;
            }
            maybeCount = 0;
            rightCount = 0;
        }
        if (c == '{') {
            leftCount++;
        } else if (c == '}') {
            maybeCount++;
            if (!leftCount) {
                rightCount++;
                if (rightCount == 2) {
                    find = true;
                    left = str.substring(0, i - 1);
                    right = str.substring(i + 1);
                    break;
                }
            } else {
                leftCount--;
            }
        }
    }
    if (!find && maybeCount >= 2 && maybeAt == -1) {
        maybeAt = str.length - 2;
    }
    if (!find) {
        if (maybeAt == -1) {
            slog.ever(chalk.red('bad partial art: {{' + str.trim() + ' at line:' + line), 'at file', chalk.magenta(e.shortHTMLFile));
            throw new Error('bad partial art: {{' + str.trim() + ' at line:' + line + ' at file:' + e.shortHTMLFile);
        } else {
            left = str.substring(0, maybeAt - 2);
            right = str.substring(maybeAt);
        }
    }
    return [left, right];
};
module.exports = (tmpl, e) => {
    let result = [];
    tmpl = artExpr.addLine(tmpl);
    let parts = tmpl.split(openTag);
    let stack = [];
    for (let part of parts) {
        let lni = artExpr.extractArtInfo(part);
        if (lni) {
            let codes = findBestCode(lni.art, e, lni.line);
            result.push(syntax(codes[0], stack, e, lni.line), codes[1]);
        } else {
            result.push(part);
        }
    }
    checkStack(stack, 'unclosed', '', e);
    //console.log(result);
    return artExpr.recoverEvent(result.join(''));
};