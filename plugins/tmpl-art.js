/*
https://github.com/lhywork/artTemplate/
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

    {{for init = start to end step 2}}
        {{= init }}
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
let loopReg = /([^=]+?)=([^=]+?)\s+to\s+([\s\S]*?)(?:\s+step\s+([\w_$\.]*))?$/;
let stringKeyReg = /^['"][\s\S]+?['"]$/;
let extractMxEventContentReg = /^([^({]+)\(\{([\s\S]+)\}\)(['"])$/;
let mxEventHolderReg = /\x12([^\x12]+?)\x12/g;
let openTag = '{{';
let closeTag = /\}{2}(?!\})/;
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
    'loop'(stack, ln) {
        stack.push({ ctrl: 'loop', ln });
    },
    '/loop'(stack) {
        let last = stack.pop();
        if (last) {
            if (last.ctrl != 'loop') {
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
    let declares = '';
    key = key.trim();
    value = value.trim();
    if ((value[0] == '{' && value[value.length - 1] == '}') ||
        (value[0] == '[' && value[value.length - 1] == ']')) {
        let ae = value[0] == '[';
        let vs = value.slice(1, -1).split(',');
        let temp = utils.uId('$v', code);
        declares += `${temp},`;
        assignment = `${temp}=${object}[${key}];if(${temp}){`;
        if (ae) {
            for (let i = 0, v; i < vs.length; i++) {
                v = vs[i];
                v = v.trim();
                if (v) {
                    declares += v + ',';
                    assignment += `${v}=${temp}[${i}];`;
                }
            }
        } else {
            for (let v of vs) {
                let kv = v.split(':');
                if (kv.length == 1) {
                    kv.push(v);
                }
                let ovalue = kv[1].trim();
                declares += ovalue + ',';
                let okey = kv[0].trim();
                assignment += `${ovalue}=${temp}`;
                if (stringKeyReg.test(okey)) {
                    assignment += `[${okey}];`;
                } else {
                    assignment += `.${okey};`;
                }
            }
        }
        declares = declares.slice(0, -1);
        assignment = assignment.slice(0, -1) + '}';
    } else {
        declares = value;
        assignment = `${value}=${object}[${key}]`;
    }
    return { declares, assignment };
};
let syntax = (code, stack, e, lineNo, refMap) => {
    code = code.trim();
    let ctrls = code.split(/\s+/);
    let key = ctrls.shift();
    let src = '';
    if (configs.debug) {
        src = `<%'${lineNo}\x11${code.replace(slashReg, '\\$&')}\x11'%>`;
        if (code[0] === ':') {//绑定的不处理
            let key = code.slice(1).match(/^[^<({]+/)[0].trim();
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
        return `${src}<%if(${ctrls.join(' ')}){%>`;
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
        //console.log(m);
        if (!m) {
            slog.ever(chalk.red(`unsupport each {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport each {{' + code + '}}');
        }
        let value = m[1];
        let index = m[2] || utils.uId('$i', code);
        let ai = getAssignment(code, object, index, value);
        return `${src}<%for(let ${ai.declares},${index}=0;${index}<${object}.length;${index}++){${ai.assignment}%>`;
    } else if (key == 'forin') {
        checkStack(stack, key, code, e, lineNo);
        let object = ctrls[0];
        let asValue = ctrls.slice(2).join(' ');
        let m = asValue.match(asReg);
        if (!m) {
            slog.ever(chalk.red(`unsupport forin {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport forin {{' + code + '}}');
        }
        let value = m[1];
        let key1 = m[2] || utils.uId('$k', code);
        let ai = getAssignment(code, object, key1, value);
        return `${src}<%for(let ${key1} in ${object}){let ${ai.declares};${ai.assignment}%>`;
    } else if (key == 'loop') {
        checkStack(stack, key, code, e, lineNo);
        let loopValue = ctrls.join(' ');
        let m = loopValue.match(loopReg);
        if (!m) {
            slog.ever(chalk.red(`unsupport loop {{${code}}} at line:${lineNo}`), 'file', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport loop {{' + code + '}}');
        }
        let variable = m[1];
        let start = m[2];
        let end = m[3];

        let sn = Number(start);
        let en = Number(end);

        let stepBase = m[4] || 1;
        let check = '';
        if (configs.debug) {
            check = `if(${stepBase}<=0){throw 'endless loop: {\u2060{${code}}\u2060} at line: ${lineNo}'}`;
        }
        if (!isNaN(sn) && !isNaN(en)) {
            let step = (sn > en ? '-' : '') + stepBase;
            let test = sn > en ? `${variable}>=${end}` : `${variable}<=${end}`;
            return `<%${check}for(let ${variable}=${start};${test};${variable}+=${step}){%>`;
        }
        let vStep = utils.uId('$s', code);
        let step = `let ${vStep}=${start}>${end}?-${stepBase}:${stepBase};`;
        return `${src}<%${check}${step}for(let ${variable}=${start};${vStep}>0?${variable}<=${end}:${variable}>=${end};${variable}+=${vStep}){%>`;
    } else if (key == '/if' || key == '/each' || key == '/forin' || key == '/loop') {
        checkStack(stack, key, code, e, lineNo);
        return `${src}<%}%>`;
    } else {
        return `${src}<%${code}%>`;
    }
};
module.exports = (tmpl, e, refMap) => {
    let result = [];
    tmpl = tmpl.replace(configs.tmplMxEventReg, m => m.replace(extractMxEventContentReg, '$1\x12$2\x12$3'));
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
            let codes = lni[2].split(closeTag);
            result.push(syntax(codes[0], stack, e, lni[1], refMap), codes[1]);
        } else {
            result.push(part);
        }
    }
    checkStack(stack, 'unclosed', '', e);
    //console.log(result.join(''));
    return result.join('').replace(mxEventHolderReg, '({$1})');
};