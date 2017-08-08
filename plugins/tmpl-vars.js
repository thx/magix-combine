/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
    压缩模板引擎代码
 */
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let tmplCmd = require('./tmpl-cmd');
let configs = require('./util-config');
let slog = require('./util-log');
let regexp = require('./util-rcache');
let tmplCmdReg = /<%([@=!:~])?([\s\S]+?)%>|$/g;
let tagReg = /<([^>\s\/\u0007]+)([^>]*)>/g;
let bindReg = /([^>\s\/=]+)\s*=\s*(["'])\s*<%:([\s\S]+?)%>\s*\2/g;
let bindReg2 = /\s*<%:([\s\S]+?)%>\s*/g;
let pathReg = /<%~([\s\S]+?)%>/g;
let textaraReg = /<textarea([^>]*)>([\s\S]*?)<\/textarea>/g;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
let vphUse = String.fromCharCode(0x7528); //用
let vphDcd = String.fromCharCode(0x58f0); //声
let vphCst = String.fromCharCode(0x56fa); //固
let vphGlb = String.fromCharCode(0x5168); //全
let creg = /[\u7528\u58f0\u56fa\u5168]/g;
let hreg = /([\u0001\u0002])\d+/g;
let compressVarReg = /\u0001\d+[a-zA-Z\_$]+/g;
let htmlHolderReg = /\u0005\d+\u0005/g;
let scharReg = /(?:`;|;`)/g;
let stringReg = /^['"]/;
let bindEventParamsReg = /^\s*"([^"]+)",/;
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
let cmap = {
    [vphUse]: '\u0001',
    [vphDcd]: '\u0002',
    [vphGlb]: '\u0003',
    [vphCst]: '\u0006'
};
let stripChar = str => str.replace(creg, m => cmap[m]);
let stripNum = str => str.replace(hreg, '$1');
let loopNames = {
    forEach: 1,
    map: 1,
    filter: 1,
    some: 1,
    every: 1,
    reduce: 1,
    reduceRight: 1,
    find: 1,
    each: 1
};
let genEventReg = type => { //获取事件正则，做绑定时，当原来已经存在如change,input等事件时，原来的事件仍需调用
    return regexp.get('\\bmx-' + type + '\\s*=\\s*"([^\\(]+)\\(([\\s\\S]*?)\\)"');
};
let splitExpr = expr => { //拆分表达式，如"list[i].name[object[key[value]]]" => ["list", "[i]", "name", "[object[key[value]]]"]
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
};

let leftOuputReg = /\u0018",/g;
let rightOutputReg = /,"/g;
let extractFunctions = expr => { //获取绑定的其它附加信息，如 <%:[change,input] user.name {refresh}%>  =>  evts:change,input  expr user.name  fns  refresh
    let fns = '';
    let evts = '';

    let m = expr.match(bindEventParamsReg);
    if (m) {
        evts = m[1].split(',');
        expr = expr.replace(bindEventParamsReg, '');
    }
    let firstComma = expr.indexOf(',');
    if (firstComma > -1) {
        fns = expr.slice(firstComma + 2, -1);
        expr = expr.slice(0, firstComma);
        //console.log(fns);
        fns = fns.replace(leftOuputReg, '\'<%=').replace(rightOutputReg, '%>\'');
        //console.log(fns);
    }
    return {
        expr,
        evts,
        fns
    };
};
let vkeys = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
let variable = count => { //压缩变量
    let result = '',
        temp;
    do {
        temp = count % vkeys.length;
        result = vkeys.charAt(temp) + result;
        count = (count - temp) / vkeys.length;
    }
    while (count);
    return result;
};
/*
    \u0000  `反撇
    \u0001  模板中局部变量  用
    \u0002  变量声明的地方  声
    \u0003  模板中全局变量  全
    \u0004  命令中的字符串
    \u0005  html中的字符串
    \u0006  constVars 固定不会变的变量
    \u0007  存储命令
    \u0008  压缩命令
    \u0011  精准识别rqeuire
    \u0012  精准识别@符
    \u0017  模板中的纯字符串
    \u0018  模板中的绑定参数对象
    \u0019  模板中的循环
    第一遍用汉字
    第二遍用不可见字符
 */
module.exports = {
    process: (tmpl, reject, e, extInfo) => {
        let sourceFile = e.shortHTMLFile;
        let fn = [];
        let index = 0;
        let htmlStore = Object.create(null);
        let htmlIndex = 0;
        //console.log(tmpl);
        tmpl.replace(tmplCmdReg, (match, operate, content, offset) => {
            let start = 2;
            if (operate) {
                start = 3;
                content = '(' + content + ')';
            }
            let source = tmpl.slice(index, offset + start);
            let key = '\u0005' + (htmlIndex++) + '\u0005';
            htmlStore[key] = source;
            index = offset + match.length - 2;
            fn.push(';`' + key + '`;', content);
        });
        fn = fn.join(''); //移除<%%> 使用`变成标签模板分析
        let ast;
        let recoverHTML = fn => {
            fn = fn.replace(scharReg, '');
            fn = fn.replace(htmlHolderReg, m => htmlStore[m]);
            return fn;
        };
        //console.log(fn);
        //return;
        //console.log(fn);
        try {
            ast = acorn.parse(fn);
        } catch (ex) {
            slog.ever('parse html cmd ast error:', ex.message.red);
            let html = recoverHTML(fn.slice(Math.max(ex.loc.column - 10, 0)));
            slog.ever('near html:', (html.slice(0, 100)).green);
            slog.ever('html file:', sourceFile.gray);
            reject(ex);
        }
        let globalExists = Object.assign(Object.create(null), configs.tmplGlobalVars);
        let globalTracker = Object.create(null);
        if (extInfo.tmplScopedGlobalVars) {
            globalExists = Object.assign(globalExists, extInfo.tmplScopedGlobalVars);
        }
        /*
            变量和变量声明在ast里面遍历的顺序不一致，需要对位置信息保存后再修改fn
         */
        let modifiers = [];
        let stringStore = Object.create(null);
        let stringIndex = 0;
        let compressVarsMap = Object.create(null);
        let varCount = 0;
        let recoverString = tmpl => {
            //还原代码中的字符串，代码中的字符串占位符使用\u0004包裹
            //模板中的绑定特殊字符串包含\u0017，这里要区分这个字符串的来源
            return tmpl.replace(/(['"])(\u0004\d+\u0004)\1/g, (m, q, c) => {
                let str = stringStore[c].slice(1, -1); //获取源字符串
                let result;
                if (str.charAt(0) == '\u0017') { //如果是\u0017，这个是绑定时的特殊字符串
                    result = q + str.slice(1) + q;
                } else { //其它情况再使用\u0017包裹
                    result = q + '\u0017' + str + '\u0017' + q;
                }
                //console.log(JSON.stringify(m), result, JSON.stringify(result));
                return result;
            });
        };
        let fnRange = [];
        let compressVarToOriginal = Object.create(null);
        let constVars = Object.assign(Object.create(null), configs.tmplConstVars);
        if (extInfo.tmplScopedConstVars) {
            constVars = Object.assign(constVars, extInfo.tmplScopedConstVars);
        }
        walker.simple(ast, {
            CallExpression(node) { //方法调用
                let vname = '';
                let callee = node.callee;
                if (callee.name) { //只处理模板中 <%=fn(a,b)%> 这种，不处理<%=x.fn()%>，后者x对象上除了挂方法外，还有可能挂普通数据。对于方法我们不把它当做变量处理，因为给定同样的参数，方法需要返回同样的结果
                    vname = callee.name;
                    constVars[vname] = 1;
                } else {
                    //以下是记录，如user.name.get('key');某个方法在深层对象中，需要把整个路径给还原出来。
                    vname = fn.slice(callee.start, callee.end);
                    //let vpath = [];
                    //let start = callee;
                    //console.log(callee);
                    //while (start) {
                    //    if (start.property) {
                    //        vpath.push(start.property.name);
                    //    }
                    //    if (start.object) {
                    //        start = start.object;
                    //    } else {
                    //        break;
                    //    }
                    //}
                    //if (!start.name) { //连调情况，如a.replace().replace();
                    //    return;
                    //}
                    //vpath.push(start.name);
                    //vname = vpath.reverse().join('.'); //路径如user.name.get
                }
                let args = configs.tmplPadCallArguments(vname, sourceFile);
                if (args && args.length) {
                    if (!Array.isArray(args)) {
                        args = [args];
                    }
                    for (let i = 0; i < args.length; i++) {
                        args[i] = vphGlb + '.' + args[i];
                    }
                    modifiers.push({
                        key: '',
                        start: node.end - 1,
                        end: node.end - 1,
                        name: (node.arguments.length ? ',' : '') + args.join(',')
                    });
                }
            }
        });
        let processString = node => { //存储字符串，减少分析干扰
            stringReg.lastIndex = 0; //把代码中的字符串存储起来，换成占位符
            if (stringReg.test(node.raw)) {
                let q = node.raw.match(stringReg)[0];
                let key = '\u0004' + (stringIndex++) + '\u0004';
                stringStore[key] = node.raw;
                modifiers.push({
                    key: '',
                    start: node.start,
                    end: node.end,
                    name: q + key + q
                });
            }
        };
        walker.simple(ast, {
            Property(node) {
                stringReg.lastIndex = 0;
                if (node.key.type == 'Literal') {
                    processString(node.key);
                }
            },
            Literal: processString,
            Identifier(node) {
                let tname = node.name; // compressVarsMap[node.name] || node.name;
                //console.log(compressVarsMap,node.name,node.start,fnRange);
                if (!globalExists[tname]) { //模板中全局不存在这个变量
                    modifiers.push({ //如果是指定不会改变的变量，则加固定前缀，否则会全局前缀
                        key: (constVars[tname] ? vphCst : vphGlb) + '.',
                        start: node.start,
                        end: node.end,
                        name: tname
                    });
                } else { //如果变量不在全局变量里，则增加使用前缀
                    if (!configs.tmplGlobalVars.hasOwnProperty(tname)) {
                        //console.log(node.name, compressVarsMap);
                        modifiers.push({
                            key: vphUse + node.end,
                            start: node.start,
                            end: node.end,
                            name: tname,
                            type: 'ui'
                        });
                    }
                }
            },
            AssignmentExpression(node) { //赋值语句
                if (node.left.type == 'Identifier') {
                    let lname = node.left.name;
                    let tname = lname; // compressVarsMap[lname] || lname;
                    if (configs.compressTmplVariable) { //如果压缩，则压缩变量
                        modifiers.push({
                            key: '',
                            start: node.left.start,
                            end: node.left.end,
                            name: tname,
                            type: 'ae'
                        });
                    }
                    if (!globalExists[tname]) { //模板中使用如<%list=20%>这种，虽然可以，但是不建议使用，因为在模板中可以修改js中的数据，这是非常不推荐的
                        slog.ever(('undeclare variable:' + lname).red, 'at', sourceFile.gray);
                    }
                    globalExists[tname] = (globalExists[tname] || 0) + 1; //记录某个变量被重复赋值了多少次，重复赋值时，在子模板拆分时会有问题
                    if (globalExists[tname] > 2) {
                        if (e.refGlobalLeak && !e.refGlobalLeak['_' + lname]) {
                            e.refGlobalLeak['_' + lname] = 1;
                            e.refGlobalLeak.reassigns.push(('avoid reassign variable:' + lname).red + ' at ' + sourceFile.gray);
                        }
                    }
                } else if (node.left.type == 'MemberExpression') {
                    let start = node.left;
                    while (start.object) {
                        start = start.object;
                    } //模板中使用如<%list.x=20%>这种，虽然可以，但是不建议使用，因为在模板中可以修改js中的数据，这是非常不推荐的
                    if (!globalExists[start.name]) {
                        slog.ever(('avoid writeback: ' + fn.slice(node.start, node.end)).red, 'at', sourceFile.gray);
                    }
                }
            },
            VariableDeclarator(node) { //变量声明
                let tname = node.id.name;
                if (configs.compressTmplVariable) {
                    let cname = variable(varCount++);
                    if (!compressVarsMap[tname]) { //可能使用同一个key进行多次声明，我们要处理这种情况
                        compressVarsMap[tname] = [];
                    }
                    compressVarsMap[tname].push({
                        name: cname,
                        pos: node.start
                    });
                }
                globalExists[tname] = node.init ? 2 : 1; //每次到变量声明的地方都重新记录这个变量的赋值次数
                modifiers.push({
                    key: vphDcd + node.start,
                    start: node.id.start,
                    end: node.id.end,
                    name: tname,
                    type: 'vd',
                });
            },
            FunctionDeclaration: node => { //函数声明
                globalExists[node.id.name] = 2;
                fnRange.push(node);
            },
            FunctionExpression: node => fnRange.push(node),
            ArrowFunctionExpression: node => fnRange.push(node),
            ForOfStatement: node => {
                if (configs.checker.tmplCmdFnOrForOf) {
                    slog.ever(('avoid use ForOfStatement: ' + fn.slice(node.start, node.right.end + 1)).red, 'at', sourceFile.gray, 'more info:', 'https://github.com/thx/magix/issues/37'.magenta);
                }
            }
        });

        fnRange.sort((a, b) => {
            return a.start - b.start;
        });
        let fnProcessor = () => { //函数在遍历时要特殊处理
            let processOne = (node, pInfo) => {
                let fns = [node.type == 'ArrowFunctionExpression' ? '(' : 'function('];
                if (node.params && node.params.length) { //还原成function(args1,args){}，用于控制台的提示
                    node.params.forEach(p => {
                        fns.push(p.name, ',');
                    });
                    fns.pop();
                }
                if (node.type == 'ArrowFunctionExpression') {
                    fns.push(')=>{}');
                } else {
                    fns.push('){}');
                }
                if (configs.checker.tmplCmdFnOrForOf) {
                    slog.ever(('avoid use Function: ' + fns.join('')).red, 'at', sourceFile.gray, 'more info:', 'https://github.com/thx/magix/issues/37'.magenta); //尽量不要在模板中使用function，因为一个function就是一个独立的上下文，对于后续的绑定及其它变量的获取会很难搞定
                }
                let params = Object.create(null);
                let pVarsMap = Object.create(null);
                /*
                    1. 记录参数，函数体内的与参数同名的变量不做任何处理
                    2. 压缩参数
                 */
                for (let i = 0, p; i < node.params.length; i++) { //处理参数
                    p = node.params[i];
                    params[p.name] = 1; //记录有哪些参数
                    if (configs.compressTmplVariable) { //如果启用变量压缩
                        modifiers.push({ //压缩参数
                            key: vphDcd + p.start,
                            start: p.start,
                            end: p.end,
                            name: pVarsMap[p.name] = variable(varCount++)　 //压缩参数
                        });
                    }
                }
                //移除arguments;
                for (let j = modifiers.length - 1; j >= 0; j--) {
                    let m = modifiers[j];
                    if (m.name == 'arguments' && node.start < m.start && node.end > m.end) {
                        modifiers.splice(j, 1);
                    }
                }
                let walk = expr => { //遍历函数体
                    if (expr) {
                        if (expr.type == 'Identifier') {
                            //该标识在参数里，且在函数体内没有声明过，即考虑这样的情况
                            /*
                                function(aaa){
                                    //...
                                    var aaa=20;
                                }
                                函数参数中有aaa,但函数体内又重新声明了aaa，则忽略参数的aaa压缩
                             */
                            if (pInfo.params[expr.name] && !pInfo.vd[expr.name]) {
                                //如果在参数里，移除修改器里面的，该参数保持不变
                                let find = false;
                                //修改器中的标识优先于函数，该处把修改器中的与当前函数有关的移除
                                for (let j = modifiers.length - 1; j >= 0; j--) {
                                    let m = modifiers[j];
                                    if (expr.start == m.start) {
                                        find = true;
                                        //modifiers[j].key = vphUse + modifiers[j].end;
                                        modifiers.splice(j, 1);
                                        break;
                                    }
                                }
                                //如果该参数从修改器中移除，则表示是当前方法的形参，如果启用压缩，则使用压缩后的变量
                                if (find && configs.compressTmplVariable) {
                                    let v = pVarsMap[expr.name] || expr.name;
                                    modifiers.push({
                                        key: vphUse + expr.end,
                                        start: expr.start,
                                        end: expr.end,
                                        name: v
                                    });
                                    compressVarToOriginal['\u0001' + expr.end + v] = expr.name;
                                }
                            }
                        } else if (Array.isArray(expr)) {
                            for (let i = 0; i < expr.length; i++) {
                                walk(expr[i]);
                            }
                        } else if (expr instanceof Object) {
                            for (let p in expr) {
                                walk(expr[p]);
                            }
                        }
                    }
                };
                walk(node.body.body);
            };
            let getParentParamsAndVD = node => { //获取所有父级的函数参数及当前函数内的声明
                /*
                    _.each(function(a,b){
                        var a=20;
                        _.each(b,function(c,d){
                            var d=20;
                            //在处理该函数体的标识时，比如
                            <%=a%>
                            //该处的a来源于外层函数的形参，如果压缩，则需要与外层对应上
                        });
                    })
                 */
                let p = [node];
                for (let i = 0, r; i < fnRange.length; i++) { //查找在哪些个函数体内，因为函数可以一直嵌套
                    r = fnRange[i];
                    if (r != node && r.start < node.start && r.end > node.end) {
                        p.push(r);
                    }
                }
                let params = Object.create(null),
                    vd = Object.create(null);
                if (p.length) { //打平参数
                    for (let i = 0, n; i < p.length; i++) {
                        n = p[i];
                        for (let j = 0, a; j < n.params.length; j++) {
                            a = n.params[j];
                            params[a.name] = 1;
                        }
                    }
                }
                //获取当前函数体内的声明语句
                for (let z = modifiers.length - 1, m; z >= 0; z--) {
                    m = modifiers[z];
                    if (m.type == 'vd' && node.start < m.start && node.end > m.end) {
                        vd[m.name] = 1;
                    }
                }
                return {
                    params,
                    vd
                };
            };
            let start = 0;
            let paramsAndVD = [];
            while (start < fnRange.length) {
                paramsAndVD[start] = getParentParamsAndVD(fnRange[start]);
                start++;
            }
            while (--start > -1) {
                processOne(fnRange[start], paramsAndVD[start]);
            }
            //console.log(paramsAndVD);
        };
        let getFnRangeByPos = pos => { //根据位置获取在哪个函数体内
            for (let i = 0, r; i < fnRange.length; i++) {
                r = fnRange[i];
                if (r.start < pos && pos < r.end) {
                    return r;
                }
            }
        };
        let getCompressVar = (vname, pos) => { //获取压缩后的变量
            let list = compressVarsMap[vname]; //获取同一个key对应的列表
            if (!list) {
                return vname;
            }
            if (list.length == 1) { //如果只有一个，则不查找直接返回
                return list[0].name;
            }
            if (fnRange.length) {
                let range = getFnRangeByPos(pos); //获取当前变量对应的函数体
                if (range) {
                    let tlist = [];
                    //获取当前函数体内对应的都有哪些声明
                    for (let i = 0, r; i < list.length; i++) {
                        r = list[i];
                        if (r.pos > range.start && r.pos < range.end) {
                            tlist.push(r);
                        }
                    }
                    list = tlist;
                } else { //如果位置不在函数体内，则需要把函数体内的声明清除，避免影响分析
                    /*
                        <%var aaa=20%>

                        <%_.each(function(a){%>
                            <%var aaa=30%>
                        <%})%>

                        <%=aaa%>  //函数体内有aaa声明，但该处需要外部声明的aaa
                     */
                    let tlist = list.slice();
                    for (let i = tlist.length - 1, r; i >= 0; i--) {
                        r = tlist[i];
                        for (let j = 0, rj; j < fnRange.length; j++) {
                            rj = fnRange[j];
                            if (r.pos > rj.start && r.pos < rj.end) {
                                tlist.splice(i, 1);
                            }
                        }
                    }
                    list = tlist;
                }
            }
            /*
                考虑这样的情况
                <%var a=20%>
                ...
                <%=a%>

                <%var a=30%>
                ...
                <%=a%>
                输出a时，即变量压缩时，需要从列表中查找当前a对应的最佳的压缩对象
             */
            for (let i = 0, v, n; i < list.length; i++) {
                v = list[i];
                n = list[i + 1];
                if (v.pos <= pos && (!n || pos < n.pos)) {
                    return v.name;
                }
            }
            return vname;
        };
        fnProcessor();
        //console.log(compressVarsMap, fnRange);
        //根据start大小排序，这样修改后的fn才是正确的
        modifiers.sort((a, b) => a.start - b.start);
        if (configs.compressTmplVariable) { //直接修改修改器中的值即可
            for (let i = 0, m; i < modifiers.length; i++) {
                m = modifiers[i];
                if (m.type) {
                    let oname = m.name;
                    m.name = getCompressVar(m.name, m.start);
                    compressVarToOriginal['\u0001' + m.end + m.name] = oname;
                }
            }
        }
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            fn = fn.slice(0, m.start) + m.key + m.name + fn.slice(m.end);
        }
        modifiers = [];
        //console.log(fn,compressVarToOriginal,modifiers);
        //重新遍历变量带前缀的代码
        ast = acorn.parse(fn);
        let recordLoop = node => {
            modifiers.push({
                key: '\u0019',
                start: node.start,
                end: node.start,
                name: ''
            });
        };
        walker.simple(ast, {
            VariableDeclarator(node) {
                let key = stripChar(node.id.name); //把汉字前缀换成代码前缀
                var m = key.match(/\u0002(\d+)/);
                if (m) {
                    let pos = m[1]; //获取这个变量在代码中的位置
                    key = key.replace(/\u0002\d+/, '\u0001'); //转换变量标记，统一变成使用的标记
                    if (!globalTracker[key]) { //全局追踪
                        globalTracker[key] = [];
                    }
                    let hasValue = false;
                    let value = null;
                    if (node.init) { //如果有赋值
                        hasValue = true;
                        value = stripChar(fn.slice(node.init.start, node.init.end));
                    }
                    globalTracker[key].push({
                        pos: pos | 0,
                        hasValue,
                        value
                    });
                }
            },
            AssignmentExpression(node) {
                let key = '\u0001' + node.left.name;
                let value = stripChar(fn.slice(node.right.start, node.right.end));
                if (!globalTracker[key]) {
                    globalTracker[key] = [];
                }
                let list = globalTracker[key];
                if (list) {
                    let found = false;
                    for (let i of list) {
                        if (!i.hasValue) { //如果是首次赋值，则直接把原来的变成新值
                            i.value = value;
                            i.hasValue = found = true;
                            break;
                        }
                    }
                    if (!found) { //该变量存在重复赋值，记录这些重复赋值的地方，后续在变量分析追踪时有用，如<%var a=name%>...<%~a%> ....<%a=age%>...<%~a%>  两次<%~a%>输出的结果对应不同的根变量
                        list.push({
                            pos: node.left.end,
                            value: value
                        });
                    }
                }
            },
            ForStatement: recordLoop,
            WhileStatement: recordLoop,
            DoWhileStatement: recordLoop,
            ForOfStatement: recordLoop,
            ForInStatement: recordLoop,
            CallExpression: node => {
                let args = node.arguments;
                if (args && args.length > 0) {
                    let a0 = args[0];
                    let a1 = args[1];
                    if (a0.type == 'FunctionExpression' ||
                        a0.type == 'ArrowFunctionExpression' ||
                        (a1 && (a1.type == 'FunctionExpression' ||
                            a1.type == 'ArrowFunctionExpression'))) {
                        let callee = node.callee;
                        if (callee.type == 'MemberExpression') {
                            let p = callee.property;
                            if (loopNames.hasOwnProperty(p.name)) {
                                modifiers.push({
                                    key: '\u0019',
                                    start: node.start,
                                    end: node.start,
                                    name: ''
                                });
                            }
                        }
                    }
                }
            }
        });
        modifiers.sort((a, b) => a.start - b.start);
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            fn = fn.slice(0, m.start) + m.key + m.name + fn.slice(m.end);
        }
        //console.log(globalTracker);
        //fn = stripChar(fn);
        //console.log(fn);
        fn = fn.replace(scharReg, '');
        fn = stripChar(fn);
        fn = fn.replace(htmlHolderReg, m => htmlStore[m]);
        fn = fn.replace(tmplCmdReg, (match, operate, content) => {
            if (operate) {
                return '<%' + operate + content.slice(1, -1) + '%>';
            }
            return match;
        }); //把合法的js代码转换成原来的模板代码
        //console.log(fn);
        //console.log(globalTracker, fnRange);
        let cmdStore = Object.create(null);
        let getTrackerList = (key, pos) => {
            let list = globalTracker[key];
            if (!list) return null;
            if (fnRange.length) { //处理带函数的情况
                /*
                    <%var a=usr.name%>
                    <%_.each(function(){%>
                        <%var a=usr.age%>
                        <input <%:a%> />
                        <%x(function(){%>
                            <%var a=usr.sex%>
                            <input <%:a%> />
                        <%})%>
                    <%})%>
                    <input <%:a%> />

                    思路：接函数划分区间，找出当前变量落在哪个函数范围内，在该范围内再搜索对应的变量
                 */
                let range = getFnRangeByPos(pos);
                if (range) {
                    let tlist = [];
                    for (let i = 0, r; i < list.length; i++) {
                        r = list[i];
                        if (r.pos > range.start && r.pos < range.end) {
                            tlist.push(r);
                        }
                    }
                    list = tlist;
                } else {
                    let tlist = list.slice();
                    for (let i = tlist.length - 1, r; i >= 0; i--) {
                        r = tlist[i];
                        for (let j = 0, rj; j < fnRange.length; j++) {
                            rj = fnRange[j];
                            if (r.pos > rj.start && r.pos < rj.end) {
                                tlist.splice(i, 1);
                            }
                        }
                    }
                    list = tlist;
                }
            }
            return list;
        };
        let toOriginalExpr = expr => {
            if (configs.compressTmplVariable) {
                expr = stripNum(expr.replace(compressVarReg, m => compressVarToOriginal[m] || m));
            } else {
                expr = stripNum(expr);
            }
            return expr;
        };
        let best = head => {
            let match = head.match(/\u0001(\d+)/); //获取使用这个变量时的位置信息
            if (!match) return null;
            let pos = match[1];
            pos = pos | 0;
            let key = head.replace(/\u0001\d+/, '\u0001'); //获取这个变量对应的赋值信息
            let list = getTrackerList(key, pos); //获取追踪列表
            if (!list) return null;
            for (let i = list.length - 1, item; i >= 0; i--) { //根据赋值时的位置查找最优的对应
                item = list[i];
                if (item.pos < pos) {
                    return item.value;
                }
            }
            return null;
        };
        let find = (expr, srcExpr) => {
            if (!srcExpr) {
                srcExpr = expr;
            }
            //slog.ever('expr', expr);
            let ps = splitExpr(expr); //表达式拆分，如user[name][key[value]]=>["user","[name]","[key[value]"]
            /*
                1. <%:user.name%>
                2. <%var a=user.name%>...<%:a%>
                3. <%var a=user%> ...<%var b=a.name%> ....<%:b%>
             */
            let head = ps[0]; //获取第一个
            if (head == '\u0003') { //如果是根变量，则直接返回  第1种情况
                return ps.slice(1);
            }
            let info = best(head); //根据第一个变量查找最优的对应的根变量，第2种情况
            if (!info) {
                let tipExpr = toOriginalExpr(srcExpr.trim());
                expr = toOriginalExpr(expr);
                slog.ever(('can not resolve expr: ' + tipExpr).red, 'at', sourceFile.gray);
                return ['<%throw new Error("can not resolve bind expr: ' + expr + ' read more: https://github.com/thx/magix/issues/37")%>'];
            }
            if (info != '\u0003') { //递归查找,第3种情况
                ps = find(info, srcExpr).concat(ps.slice(1));
            }
            return ps; //.join('.');
        };
        let analyseExpr = (expr, source) => {
            //console.log(expr);
            let result = find(expr, source); //获取表达式信息
            //slog.ever('result', result);
            //把形如 ["user","[name]","[key[value]"]=> user.<%=name%>.<%=key[value]%>
            for (let i = 0, one; i < result.length; i++) {
                one = result[i];
                if (one.charAt(0) == '[' && one.charAt(one.length - 1) == ']') {
                    one = '<%=' + one.slice(1, -1) + '%>';
                }
                //one = stripNum(one);
                result[i] = one;
            }
            result = result.join('.');
            return result;
        };
        fn = tmplCmd.store(fn, cmdStore); //存储代码，只分析模板
        //textarea情况：<textarea><%:taValue%></textarea>处理成=><textarea <%:taValue%>><%=taValue%></textarea>
        fn = fn.replace(textaraReg, (match, attr, content) => {
            attr = tmplCmd.recover(attr, cmdStore);
            content = tmplCmd.recover(content, cmdStore);
            if (bindReg2.test(content)) {
                bindReg2.lastIndex = 0;
                let bind = '';
                content = content.replace(bindReg2, m => {
                    bind = m;
                    return m.replace('<%:', '<%=');
                });
                attr = attr + ' ' + bind;
            }
            content = tmplCmd.store(content, cmdStore);
            attr = tmplCmd.store(attr, cmdStore);
            return '<textarea' + attr + '>' + content + '</textarea>';
        });
        fn = fn.replace(tagReg, (match, tag, attrs) => {
            let bindEvents = configs.bindEvents.slice();
            let oldEvents = Object.create(null);
            let e;
            let hasMagixView = mxViewAttrReg.test(attrs); //是否有mx-view属性
            //slog.ever(cmdStore, attrs);
            attrs = tmplCmd.recover(attrs, cmdStore, recoverString); //还原

            let replacement = (m, name, params) => {
                let now = ',m:\'' + name + '\',a:' + (params || '{}');
                let old = m; //tmplCmd.recover(m, cmdStore);
                oldEvents[e] = {
                    old: old,
                    now: now
                };
                return old;
            };
            let storeUserEvents = () => { //存储用户的事件
                for (let i = 0; i < bindEvents.length; i++) {
                    e = bindEvents[i];
                    let reg = genEventReg(e);
                    attrs = attrs.replace(reg, replacement);
                }
            };
            let findCount = 0;
            if (configs.multiBind) {
                let bindStructs = {};
                let transformEvent = (exprInfo, source, attrName) => { //转换事件
                    if (exprInfo.evts) { //如果提供了绑定的事件，则使用提供的事件列表
                        bindEvents = exprInfo.evts;
                    } else {
                        bindEvents = configs.bindEvents;
                    }
                    storeUserEvents(); //存储用户的事件
                    let expr = exprInfo.expr;
                    expr = analyseExpr(expr, source); //分析表达式

                    let info;
                    for (let be of bindEvents) {
                        info = oldEvents[be];
                        if (!bindStructs[be]) {
                            bindStructs[be] = {
                                old: info ? info.now : ''
                            };
                        }
                        let viewParams = attrName && attrName.indexOf('view-') === 0;
                        let c = {
                            p: expr,
                            f: exprInfo.fns,
                            n: viewParams ? attrName.slice(5) : ''
                        };
                        if (!bindStructs[be].c) {
                            bindStructs[be].c = [];
                        }
                        let t = ['{p:\'' + c.p + '\''];
                        if (c.f) {
                            t.push(',f:' + c.f);
                        }
                        if (c.n) {
                            t.push(',n:\'' + c.n + '\'');
                        }
                        t.push('}');
                        bindStructs[be].c.push(t.join(''));
                    }
                };
                attrs.replace(bindReg, (m, name, q, expr) => {
                    expr = expr.trim();
                    let exprInfo = extractFunctions(expr);
                    transformEvent(exprInfo, m, name);
                }).replace(bindReg2, (m, expr) => {
                    expr = expr.trim();
                    let exprInfo = extractFunctions(expr);
                    transformEvent(exprInfo, m);
                });

                let t = [],
                    info;
                for (let bs in bindStructs) {
                    info = bindStructs[bs];
                    t.push(' mx-' + bs + '="' + configs.bindName + '({c:[' + info.c + ']' + (info.old ? info.old : '') + '})" ');
                }
                t = t.join('');
                attrs = attrs.replace(bindReg, (m, name, q, expr) => {
                    findCount++;
                    let replacement = '<%=';
                    let exprInfo = extractFunctions(expr);
                    if (hasMagixView && name.indexOf('view-') === 0) {
                        replacement = '<%@';
                    }
                    m = name + '=' + q + replacement + exprInfo.expr + '%>' + q;
                    if (findCount == 1) {
                        return m + t;
                    }
                    return m;
                }).replace(bindReg2, () => {
                    findCount++;
                    if (findCount == 1) {
                        return t;
                    }
                    return '';
                });
            } else {
                let transformEvent = (exprInfo, source) => { //转换事件
                    if (exprInfo.evts) { //如果提供了绑定的事件，则使用提供的事件列表
                        bindEvents = exprInfo.evts;
                    } else {
                        bindEvents = configs.bindEvents;
                    }
                    storeUserEvents(); //存储用户的事件
                    let expr = exprInfo.expr;
                    let f = '';
                    let fns = exprInfo.fns;
                    if (fns.length) { //传递的参数
                        f = ',f:' + fns;
                    }
                    expr = analyseExpr(expr, source); //分析表达式

                    let now = '',
                        info;
                    for (let i = 0; i < bindEvents.length; i++) {
                        e = bindEvents[i];
                        info = oldEvents[e];
                        now += '  mx-' + e + '="' + configs.bindName + '({p:\'' + expr + '\'' + (info ? info.now : '') + f + '})" '; //最后的空格不能删除！！！，如 <%:user%> mx-keydown="abc"  =>  mx-change="sync({p:'user'})" mx-keydown="abc"
                    }
                    return now;
                };
                attrs = attrs.replace(bindReg, (m, name, q, expr) => {
                    expr = expr.trim();
                    if (findCount > 0) {
                        slog.ever(('unsupport multi bind:' + toOriginalExpr(tmplCmd.recover(match, cmdStore, recoverString)).replace(removeTempReg, '')).red, 'at', sourceFile.gray);
                        return '';
                    }
                    findCount++;
                    let exprInfo = extractFunctions(expr);
                    let now = transformEvent(exprInfo, m, name);

                    //console.log(exprInfo, name, now);
                    let replacement = '<%=';
                    if (hasMagixView && name.indexOf('view-') === 0) {
                        replacement = '<%@';
                    }
                    m = name + '=' + q + replacement + exprInfo.expr + '%>' + q;
                    return m + now;
                }).replace(bindReg2, (m, expr) => {
                    expr = expr.trim();
                    if (findCount > 0) {
                        slog.ever(('unsupport multi bind:' + toOriginalExpr(tmplCmd.recover(match, cmdStore, recoverString)).replace(removeTempReg, '')).red, 'at', sourceFile.gray);
                        return '';
                    }
                    findCount++;
                    let exprInfo = extractFunctions(expr);
                    let now = transformEvent(exprInfo, m);
                    return now;
                });
            }
            attrs = attrs.replace(pathReg, (m, expr) => {
                expr = expr.trim();
                //console.log(JSON.stringify(expr));
                expr = analyseExpr(expr, m);
                return expr;
            }).replace(tmplCmdReg, stripNum);
            if (findCount > 0) {
                for (let old in oldEvents) {
                    let info = oldEvents[old];
                    attrs = attrs.replace(info.old, '');
                }
            }
            return '<' + tag + attrs + '>';
        });
        let processCmd = cmd => {
            //console.log(cmd, JSON.stringify(cmd), stringStore);
            return recoverString(stripNum(cmd));
        };
        fn = tmplCmd.recover(fn, cmdStore, processCmd);
        if (configs.compressTmplVariable) {
            let refVarsMap = Object.create(null);
            for (let p in compressVarToOriginal) {
                refVarsMap[stripNum(p)] = compressVarToOriginal[p];
            }
            e.toTmplSrc = (expr, refCmds) => {
                expr = tmplCmd.recover(expr, refCmds);
                for (let map in refVarsMap) {
                    let reg = regexp.get(regexp.escape(map), 'g');
                    expr = expr.replace(reg, refVarsMap[map]);
                }
                return expr.replace(removeTempReg, '');
            };
        } else {
            e.toTmplSrc = (expr, refCmds) => {
                expr = tmplCmd.recover(expr, refCmds);
                return expr.replace(removeTempReg, '');
            };
        }


        //slog.ever(JSON.stringify(fn));
        return fn;
    }
};