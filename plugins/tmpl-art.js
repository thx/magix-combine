/*
https://github.com/lhywork/artTemplate/
https://thx.github.io/crox/
在artTemplate的基础上演化而来
*/

/*
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
let openTag = '{{';
let closeTag = /\}{2}(?!\})/;
let asReg = /([\{\[]?[^\{\[]+?[\}\]]?)(\s+[\w_$]+)?$/;
let loopReg = /([^=]+?)=([^=]+?)\s+to\s+([\s\S]*?)(?:\s+step\s+([\w_$\.]*))?$/;
let numberReg = /^[+-]?(?:0x[\da-f]|\d+\.?\d*(?:E[+-]?\d*)?)$/i;
let stringKeyReg = /^['"][\s\S]+?['"]$/;
let ctrls = {
    'if'(stack) {
        stack.push('if');
    },
    'else'(stack) {
        let last = stack[stack.length - 1];
        if (last !== 'if') {
            return last;
        }
    },
    '/if'(stack) {
        let last = stack.pop();
        if (last != 'if') {
            return last;
        }
    },
    'each'(stack) {
        stack.push('each');
    },
    '/each'(stack) {
        let last = stack.pop();
        if (last != 'each') {
            return last;
        }
    },
    'forin'(stack) {
        stack.push('forin');
    },
    '/forin'(stack) {
        let last = stack.pop();
        if (last != 'forin') {
            return last;
        }
    },
    'loop'(stack) {
        stack.push('loop');
    },
    '/loop'(stack) {
        let last = stack.pop();
        if (last != 'loop') {
            return last;
        }
    }
};
let checkStack = (stack, key, code, e) => {
    let ctrl = ctrls[key];
    if (ctrl) {
        let l = ctrl(stack);
        if (l) {
            slog.ever(chalk.red(`unexpected {{${code}}}`), 'close', chalk.magenta(l), 'before it,at', chalk.grey(e.shortHTMLFile));
            throw new Error(`unexpected ${code} close ${l} before it`);
        }
    } else {
        for (let s of stack) {
            slog.ever(chalk.red(`unclosed ${s}`), 'at', chalk.grey(e.shortHTMLFile));
            throw new Error(`unclosed ${s} at ${e.shortHTMLFile}`);
        }
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
let syntax = (code, stack, e) => {
    code = code.trim();
    let ctrls = code.split(/\s+/);
    let key = ctrls.shift();
    if (key == 'if') {
        checkStack(stack, key, code, e);
        return `<%if(${ctrls.join(' ')}){%>`;
    } else if (key == 'else') {
        checkStack(stack, key, code, e);
        let iv = '';
        if (ctrls.shift() == 'if') {
            iv = ` if(${ctrls.join(' ')})`;
        }
        return `<%}else${iv}{%>`;
    } else if (key == 'each') {
        checkStack(stack, key, code, e);
        let object = ctrls[0];
        let asValue = ctrls.slice(2).join(' ');
        let m = asValue.match(asReg);
        //console.log(m);
        if (!m) {
            slog.ever(chalk.red(`unsupport each ${asValue}`), 'at', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport each ' + asValue);
        }
        let value = m[1];
        let index = m[2] || utils.uId('$i', code);
        let ai = getAssignment(code, object, index, value);
        return `<%for(let ${ai.declares},${index}=0;${index}<${object}.length;${index}++){${ai.assignment}%>`;
    } else if (key == 'forin') {
        checkStack(stack, key, code, e);
        let object = ctrls[0];
        let asValue = ctrls.slice(2).join(' ');
        let m = asValue.match(asReg);
        if (!m) {
            slog.ever(chalk.red(`unsupport forin ${asValue}`), 'at', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport forin ' + asValue);
        }
        let value = m[1];
        let key1 = m[2] || utils.uId('$k', code);
        let ai = getAssignment(code, object, key1, value);
        return `<%for(let ${key1} in ${object}){let ${ai.declares};${ai.assignment}%>`;
    } else if (key == 'loop') {
        checkStack(stack, key, code, e);
        let loopValue = ctrls.join(' ');
        let m = loopValue.match(loopReg);
        if (!m) {
            slog.ever(chalk.red(`unsupport loop ${loopValue}`), 'at', chalk.grey(e.shortHTMLFile));
            throw new Error('unsupport loop ' + loopValue);
        }
        let variable = m[1];
        let start = m[2];
        let end = m[3];
        if (numberReg.test(start) && numberReg.test(end)) {
            let sn = Number(start);
            let en = Number(end);
            let stepBase = m[4] || 1;
            let step = (sn > en ? '-' : '') + stepBase;
            let check = `if(${stepBase}<=0){throw 'endless loop: {{${code}}}'}`;
            if (!configs.debug) {
                check = '';
            }
            let test = sn > en ? `${variable}>=${end}` : `${variable}<=${end}`;
            return `<%${check}for(let ${variable}=${start};${test};${variable}+=${step}){%>`;
        }
        let vStep = utils.uId('$s', code);
        let stepBase = m[4] || 1;
        let check = `if(${stepBase}<=0){throw 'endless loop: {{${code}}}'}`;
        if (!configs.debug) {
            check = '';
        }
        let step = `let ${vStep}=${start}>${end}?-${stepBase}:${stepBase};`;
        return `<%${check}${step}for(let ${variable}=${start};${vStep}>0?${variable}<=${end}:${variable}>=${end};${variable}+=${vStep}){%>`;
    } else if (key == '/if' || key == '/each' || key == '/forin' || key == '/loop') {
        checkStack(stack, key, code, e);
        return '<%}%>';
    } else {
        return `<%${code}%>`;
    }
};
module.exports = (tmpl, e) => {
    let result = [];
    let parts = tmpl.split(openTag);
    let stack = [];
    for (let part of parts) {
        let codes = part.split(closeTag);
        if (codes.length === 1) {//html
            result.push(codes[0]);
        } else {
            result.push(syntax(codes[0], stack, e), codes[1]);
        }
    }
    checkStack(stack, 'unclosed', '', e);
    //console.log(result.join(''));
    return result.join('');
};