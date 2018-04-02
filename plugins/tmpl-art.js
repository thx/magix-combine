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
let brReg = /(?:\r\n|\r|\n)/;
let lineNoReg = /^(\d+)([\s\S]+)/;
let slashReg = /\\|'/g;
let asReg = /([\{\[]?[^\{\[]+?[\}\]]?)(\s+[\w_$]+)?$/;
let stringKeyReg = /^['"][\s\S]+?['"]$/;
let eventLeftReg = /\(\s*\{/g;
let eventRightReg = /\}\s*\)/g;
let mxEventHolderReg = /\x12([^\x12]+?)\x12/g;
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
            throw new Error(`unexpected ${code} , close ${l.ctrl} before it`);
        }
    } else if (stack.length) {
        for (let s, i = stack.length; i--;) {
            s = stack[i];
            slog.ever(chalk.red(`unclosed ${s.ctrl} at line:${s.ln}`), ', at file', chalk.grey(e.shortHTMLFile));
        }
        throw new Error(`unclosed art ctrls at ${e.shortHTMLFile}`);
    }
};
let getAssignment = (code, object, key, value) => {
    let assignment = '';
    key = key.trim();
    value = value.trim();
    if ((value[0] == '{' && value[value.length - 1] == '}') ||
        (value[0] == '[' && value[value.length - 1] == ']')) {
        let ae = value[0] == '[';
        let vs = value.slice(1, -1).split(',');
        let temp = utils.uId('$art_v', code);
        assignment = `let ${temp}=${object}[${key}];`;
        if (ae) {
            for (let i = 0, v; i < vs.length; i++) {
                v = vs[i];
                v = v.trim();
                if (v) {
                    assignment += `let ${v}=${temp}[${i}];`;
                }
            }
        } else {
            for (let v of vs) {
                let kv = v.split(':');
                if (kv.length == 1) {
                    kv.push(v);
                }
                let ovalue = kv[1].trim();
                let okey = kv[0].trim();
                assignment += `let ${ovalue}=${temp}`;
                if (stringKeyReg.test(okey)) {
                    assignment += `[${okey}];`;
                } else {
                    assignment += `.${okey};`;
                }
            }
        }
        assignment = assignment.slice(0, -1);
    } else {
        assignment = `let ${value}=${object}[${key}]`;
    }
    return assignment;
};
let syntax = (code, stack, e, lineNo, refMap) => {
    code = code.trim();
    let ctrls;
    if (code.startsWith('if(')) {
        ctrls = ['if', code.slice(3, -1)];
    } else if (code.startsWith('for(')) {
        ctrls = ['for', code.slice(3)];
    } else {
        ctrls = code.split(/\s+/);
    }
    let key = ctrls.shift();
    let src = '';
    if (configs.debug) {
        src = `<%'${lineNo}\x11${code.replace(slashReg, '\\$&')}\x11'%>`;
        if (code[0] === ':') {//绑定的不处理
            let match = code.slice(1).match(/^[^<({&]+/);
            if (!match) {
                slog.ever(chalk.red(`bad art {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
                return;
            }
            let key = match[0].trim();
            let old = refMap[key];
            if (old) {
                old.push(src);
            } else {
                refMap[key] = [src];
            }
            src = '';
        }
    }
    if (key == 'if') {
        checkStack(stack, key, code, e, lineNo);
        let expr = ctrls.join(' ');
        expr = expr.trim();
        // if (expr.startsWith('(') && expr.endsWith(')')) {
        //     expr = expr.slice(1, -1);
        // }
        return `${src}<%if(${expr}){%>`;
    } else if (key == 'else') {
        checkStack(stack, key, code, e, lineNo);
        let iv = '';
        if (ctrls.shift() == 'if') {
            iv = ` if(${ctrls.join(' ')})`;
        }
        return `${src}<%}else${iv}{%>`;
    } else if (key == 'each') {
        checkStack(stack, key, code, e, lineNo);
        let object = ctrls[0];
        let asValue = ctrls.slice(2).join(' ');
        let m = asValue.match(asReg);
        if (!m || ctrls[1] != 'as') {
            slog.ever(chalk.red(`unsupport each {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport each {{' + code + '}}');
        }
        let value = m[1];
        let index = m[2] || utils.uId('$art_i', code);
        let refObj = utils.uId('$art_obj', code);
        let ai = getAssignment(code, refObj, index, value);
        return `${src}<%for(let ${index}=0,${refObj}=${object};${index}<${refObj}.length;${index}++){${ai}%>`;
    } else if (key == 'forin') {
        checkStack(stack, key, code, e, lineNo);
        let object = ctrls[0];
        let asValue = ctrls.slice(2).join(' ');
        let m = asValue.match(asReg);
        if (!m || ctrls[1] != 'as') {
            slog.ever(chalk.red(`unsupport forin {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport forin {{' + code + '}}');
        }
        let value = m[1];
        let key1 = m[2] || utils.uId('$art_k', code);
        let refObj = utils.uId('$art_obj', code);
        let ai = getAssignment(code, refObj, key1, value);
        return `${src}<%let ${refObj}=${object};for(let ${key1} in ${refObj}){${ai}%>`;
    } else if (key == 'for') {
        checkStack(stack, key, code, e, lineNo);
        let expr = ctrls.join(' ').trim();
        if (!expr.startsWith('(') && !expr.endsWith(')')) {
            expr = `(${expr})`;
        }
        return `${src}<%for${expr}{%>`;
    } else if (key == '/if' || key == '/each' || key == '/forin' || key == '/loop' || key == '/for') {
        checkStack(stack, key, code, e, lineNo);
        return `${src}<%}%>`;
    } else {
        return `${src}<%${code}%>`;
    }
};
let findBestCode = (str, e, line) => {
    debugger;
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
        maybeAt = str.length;
    }
    if (!find) {
        if (maybeAt == -1) {
            slog.ever(chalk.red('bad partial art: {{' + str.trim() + ' at line:' + line), 'at file', chalk.magenta(e.shortHTMLFile));
            throw new Error('bad partial art: {{' + str.trim() + ' at line:' + line + ' at file:' + e.shortHTMLFile);
        } else {
            left = str.substring(0, maybeAt - 1);
            right = str.substring(maybeAt + 1);
        }
    }
    return [left, right];
};
module.exports = (tmpl, e, refMap) => {
    let result = [];
    tmpl = tmpl.replace(configs.tmplMxEventReg, m => {
        let hasLeft = eventLeftReg.test(m);
        return m.replace(eventLeftReg, '\x12')
            .replace(eventRightReg, hasLeft ? '\x12' : '$&');
    });
    let lines = tmpl.split(brReg);
    let ls = [], lc = 0;
    for (let line of lines) {
        ls.push(line.split(openTag).join(openTag + (++lc)));
    }
    tmpl = ls.join('\n');
    let parts = tmpl.split(openTag);
    let stack = [];
    for (let part of parts) {
        let lni = part.match(lineNoReg);
        if (lni) {
            let codes = findBestCode(lni[2], e, lni[1]);
            result.push(syntax(codes[0], stack, e, lni[1], refMap), codes[1]);
        } else {
            result.push(part);
        }
    }
    checkStack(stack, 'unclosed', '', e);
    return result.join('').replace(mxEventHolderReg, '({$1})');
};