let stringReg = /^['"]/;
let slog = require('./util-log');
/*
    let fn=(err,bag)=>{
        var list=bag.get('list');
        console.log('list',list.a);//list.a可能出错

        if(list.a){
            console.log(list.a);//ok
        }

        var list=bag.get('list',{});
        console.log('list',list.a);//ok

        var b=list.c;
        console.log(b.x);//b.x可能出错

        if(b){
            console.log(b.x);//ok
        }

        if(b&&b.x){
            console.log(b.x.y);//ok
        }

        if(b?b.c:b.d){
            console.log(b.c.z);//可能出错
        }
    };
 */
let isWrapper = params => { //快速检测，跳过包装的define
    if (params[0].name == 'S') { //kissy
        return true;
    }
    if (params.length == 2) {
        if (params[0].name == 'exports' && params[1].name == 'module') {
            return true;
        }
    }
    if (params.length == 3) {
        if (params[0].name == 'require' && params[1].name == 'exports' && params[2].name == 'module') {
            return true;
        }
    }
    return false;
};
let findLeftRNIndex = (tmpl, start) => {
    let max = start;
    while (--max) {
        let c = tmpl.charAt(max);
        if (c == '\r' || c == '\n') {
            return max;
        }
    }
    return max;
};
let findRightRNIndex = (tmpl, start) => {
    let max = tmpl.length;
    while (start < max) {
        let c = tmpl.charAt(start);
        if (c == '\r' || c == '\n') {
            return start;
        }
        start++;
    }
    return start;
};
//检测是否为bag.get('xx')调用
//首先只能是bag.get，另外bag要出现在参数中
//
let isBagCall = (node, paramsObject) => {
    let prop = node.callee.property;
    let co = node.callee.object;
    let coName = co && co.name;
    //形如  bag.get('xxx',[]);的情况，
    if (prop && prop.name == 'get' && paramsObject[coName]) {
        return true;
    }
    return false;
};
//检测是否缺少默认值
let isMissingDefaultValueBagCall = node => {
    let args = node.arguments;
    let a0IsString = false;
    if (args && args.length > 0) {
        a0IsString = stringReg.test(args[0].raw);
    }
    return args.length == 1 && a0IsString;
};
//获取是否是bag.get调用，同时检测是否可能出错
let maybeErrorBagCall = (node, paramsObject) => {
    let start = node;
    let count = 0;
    let key, power, isBC, missingDefault, dType;
    while (start) { //bag('xx').list.xx  这种情况不安全，需要提示
        if (start.type == 'CallExpression') {
            if (isBagCall(start, paramsObject)) {
                isBC = true;
                power = count;
                if (isMissingDefaultValueBagCall(start) || count > 1) {
                    key = start.start + '@' + start.end;
                    missingDefault = true;
                } else {
                    let a1 = start.arguments[1];
                    dType = a1.type;
                }
                break;
            }
        }
        count++;
        start = start.object;
    }
    return {
        missingDefault,
        isBC,
        dType,
        power, //跟在方法调用后的几层属性，如bag.get('xx').aa.bb
        key
    };
};
//获取指向服务端返回的数据且表达式最长的一个
let getLongestExpr = (node, varTracker, sge, oexpr) => {
    if (node.type == 'Identifier') {
        if (varTracker[node.name]) {
            return 1;
        }
        return -1;
    } else if (node.type == 'MemberExpression') {
        let count = 1;
        let start = node;
        while (start.object) {
            start = start.object;
            count++;
        }
        if (varTracker[start.name]) {
            return count;
        }
    } else if (node.type == 'ConditionalExpression') {
        let a = getLongestExpr(node.alternate, varTracker);
        let c = getLongestExpr(node.consequent, varTracker);
        return Math.max(a, c);
    } else if (node.type == 'LogicalExpression') {
        if (sge) {
            if (node.operator == '&&' || node.left.value) {
                sge(node.left, oexpr);
            }
        }
        return getLongestExpr(node.right, varTracker);
    }
    return -1;
};
module.exports = (node, comments, tmpl, e) => {

    let params = node.params;
    if (params.length <= 1 || isWrapper(params)) { //参数要大于1个，因为回调形式为(err,bag)=>{}
        return;
    }
    let paramsObject = Object.create(null);
    let usedParams = Object.create(null);
    let maybeError = [];
    let varTracker = Object.create(null);
    let safeguard = [];
    let safeguardMap = [];
    let memberExpressions = [];
    let addedME = Object.create(null);
    let callPoints = Object.create(null);
    //获取最近的保护父级
    let getNearestParent = r => {
        let p;
        for (let i = 0, sg; i < safeguard.length; i++) {
            sg = safeguard[i];
            if (sg.start <= r.start && r.end <= sg.end) {
                p = sg;
            }
        }
        return p;
    };
    //获取所有父及祖先上的保护变量
    let getParentSafed = r => {
        let safed = Object.create(null);
        for (let i = 0, sg; i < safeguard.length; i++) {
            sg = safeguard[i];
            if (sg.start <= r.start && r.end <= sg.end) {
                Object.assign(safed, sg.safed);
            }
        }
        return safed;
    };
    let uncheck = p => {
        do {
            if (comments[p]) {
                if (comments[p].text == 'mc-uncheck') {
                    return true;
                }
            }
            let c = tmpl.charAt(p);
            if (c != ' ' && c != ';' && c != '\r' && c != '\n' && c != '\t') {
                return false;
            }
        } while (p++ < tmpl.length);
    };
    for (let i = 1, p; i < params.length; i++) { //记录有哪些形参,第一个是错误，不用记录
        p = node.params[i];
        paramsObject[p.name] = 1; //记录有哪些参数
    }
    //处理赋值
    let assign = (expr, oexpr, vname, sge) => {
        if (expr.type == 'MemberExpression' ||
            expr.type == 'CallExpression') { //var a=bag.get('xx')或var a=bag.get('xx').list的情况
            let info = maybeErrorBagCall(expr, paramsObject);
            if (info.isBC) { //检测是否包含bag.get
                varTracker[vname] = {
                    type: 'bc',
                    value: [vname],
                    dt: info.dType,
                    md: info.missingDefault,
                    power: info.power
                };
            } else if (expr.type != 'CallExpression') { //var a=b.c.d情况
                let start = expr;
                let values = [];
                while (start.object) {
                    values.push(tmpl.slice(start.property.start, start.property.end));
                    start = start.object;
                }
                if (start.name) {
                    let p = varTracker[start.name]; //这是指向服务端返回数据对象的变量
                    if (p) {
                        values.push(start.name);
                        values = values.reverse();
                        if (p.type == 'ae') { //如果父级是变量引用，则父级的加上自身的
                            /*
                                var a=bag.get('list');
                                var b=a.c; =>   b=['a','c']

                                var d=b.z; =>   d=['a','c','z']

                                每个变量直接获取到服务端返回的对象的那个变量上，避免中间的变量引用查找
                             */
                            values = p.value.concat(values.slice(1));
                        }
                        let np = {
                            type: 'ae',
                            value: values
                        };
                        varTracker[vname] = np; //记录
                    }
                }
            }
            //var a=b的情况
        } else if (expr.type == 'Identifier') {
            let p = varTracker[expr.name];
            if (p) {
                /*
                    var list=bag.get('list');

                    var a=list.xx;

                    var b=a;  => b=['list','xxx'];
                 */
                varTracker[vname] = {
                    type: 'ae',
                    value: p.value
                };
            }
            //var b=bag&&bag.x&&bag.x.y情况
        } else if (expr.type == 'LogicalExpression') {
            //左边是保护区
            if (expr.operator == '&&' || expr.left.value) {
                sge(expr.left, oexpr);
            }
            assign(expr.right, oexpr, vname, sge);
            //let l = getLongestExpr(expr.left, varTracker);
            //let r = getLongestExpr(expr.right, varTracker);
            //if (l > -1 || r > -1) {
            //    if (l > r) {
            //        assign(expr.left, oexpr, vname, sge);
            //    } else {
            //        //把右边的赋值给变量
            //        assign(expr.right, oexpr, vname, sge);
            //    }
            //}
            //var b=bag?bag.list:bag.default;
        } else if (expr.type == 'ConditionalExpression') {
            sge(expr.test, oexpr); //test是保护区
            //获取哪个包含指向服务端的数据且是最长的
            let c = getLongestExpr(expr.consequent, varTracker, sge, oexpr);
            let a = getLongestExpr(expr.alternate, varTracker, sge, oexpr);
            let aexpr;
            /*
                var a=list?list.d:[];
             */
            if (c > -1 || a > -1) { //包含指向服务端数据的表达式
                if (c > a) {
                    aexpr = expr.consequent;
                } else {
                    aexpr = expr.alternate;
                }
                assign(aexpr, oexpr, vname, sge);
            }
        }
    };
    //保护表达式
    let safeguardExpression = (iexpr, expr) => {
        let key = expr.start + '@' + expr.end;
        //if(list)
        if (iexpr.type == 'Identifier') {
            let vname = iexpr.name;
            let p = varTracker[vname]; //保护的这个变量指向服务端数据
            if (p) {
                let r = varTracker[p.value[0]];
                let pInfo = safeguardMap[key]; //同样位置有多个
                if (pInfo) { //只需要添加到原来中即可
                    pInfo.safed[p.value.join('\r')] = 1;
                } else {
                    let pSafed = getParentSafed(expr); //获取父级的保护，把父级的merge进来
                    safeguard.push(safeguardMap[key] = { //记录保护
                        safed: Object.assign({
                                        [p.value[0]]: !r.power && !r.md,
                                        [p.value.join('\r')]: 1
                        }, pSafed),
                        start: expr.start,
                        end: expr.end
                    });
                }
            }
            //if (list.a)
        } else if (iexpr.type == 'MemberExpression') {
            let start = iexpr;
            let keys = [];
            while (start.object) {
                keys.push(tmpl.slice(start.property.start, start.property.end));
                start = start.object;
            }
            let p = varTracker[start.name];
            if (p) {
                let pInfo = safeguardMap[key];
                let r = varTracker[p.value[0]];
                //console.log(key, pInfo, keys);
                let vname = p.value.concat(keys.reverse());
                if (pInfo) {
                    pInfo.safed[vname.join('\r')] = 1;
                } else {
                    let pSafed = getParentSafed(expr);
                    safeguard.push(safeguardMap[key] = {
                        safed: Object.assign({
                                        [p.value[0]]: !r.power && !r.md,
                                        [vname.join('\r')]: 1
                        }, pSafed),
                        start: expr.start,
                        end: expr.end
                    });
                }
            }
            //if(list&&list.a&&list.a.b||list.c)
        } else if (iexpr.type == 'LogicalExpression') {
            //debugger;
            //if (iexpr.operator == '&&') {
            safeguardExpression(iexpr.left, expr);
            safeguardExpression(iexpr.right, expr);
            //} else if (iexpr.operator == '||') {
            //    if (iexpr.left.value) {
            //        safeguardExpression(iexpr.left, expr);
            //        safeguardExpression(iexpr.right, expr);
            //    } else { //考虑左侧可以检测出如if(0||right) if(false||right)的情况，这种需要处理右边的表达式
            //        safeguardExpression(iexpr.right, expr);
            //    }
            //}
            //if((a=list))
        } else if (iexpr.type == 'AssignmentExpression') {
            let vname = iexpr.left.name;
            let init = iexpr.right;
            safeguardExpression(init, expr);
            assign(iexpr.right, expr, vname, safeguardExpression);
            //if(list?list.f:list.d)
        } else if (iexpr.type == 'ConditionalExpression') {
            safeguardExpression(iexpr.test, expr);
            /*
                if(list?list.d:list.f){
                    console.log(list.d.x);//这句可能会有问题
                }
             */
            //let c = getLongestExpr(iexpr.consequent, varTracker);
            //let a = getLongestExpr(iexpr.alternate, varTracker);
            //if (c == -1 || a == -1) { //如果这2个都包含指向服务端数据的表达式，则一个也不保护
            //    if (c != -1) {
            //        safeguardExpression(iexpr.consequent, expr);
            //    } else {
            //        safeguardExpression(iexpr.alternate, expr);
            //    }
            //}
        } else if (iexpr.type == 'UnaryExpression') {
            //debugger;
            safeguardExpression(iexpr.argument, expr);
        }
    };
    let walk = expr => {
        if (expr) {
            if (expr.type == 'CallExpression') {
                callPoints[expr.start] = expr;
                let isBC = isBagCall(expr, paramsObject);
                let co = expr.callee.object;
                let coName = co && co.name;
                if (isBC) {
                    usedParams[coName] = 1;
                    //形如 bag.get('xxx')的情况，这种要提示用户
                    if (isMissingDefaultValueBagCall(expr)) {
                        let nearRN = findLeftRNIndex(tmpl, expr.start);
                        let part = tmpl.slice(expr.start, expr.end);
                        let near = (tmpl.slice(nearRN, expr.start) + part).trim();
                        let replacement = near.slice(0, -1) + ',defaultValue)';
                        maybeError.push({
                            type: 'bc',
                            pos: expr.start,
                            part,
                            near,
                            replacement
                        });
                    }
                }
            } else if (expr.type == 'MemberExpression') {
                if (!addedME[expr.start]) {
                    addedME[expr.start] = 1;
                    let ce = callPoints[expr.start];
                    let info = maybeErrorBagCall(ce || expr, paramsObject);
                    if (info.key) {
                        if (info.missingDefault && info.power) {
                            let left = findLeftRNIndex(tmpl, expr.start);
                            let right = findRightRNIndex(tmpl, expr.end);
                            let near = tmpl.slice(left, right).trim();
                            memberExpressions.push({
                                type: 'bc',
                                part: tmpl.slice(expr.start, expr.end),
                                near: near,
                                start: expr.start,
                                end: expr.end
                            });
                        }
                    } else {
                        let start = expr;
                        let values = [];
                        while (start.object) {
                            values.push(tmpl.slice(start.property.start, start.property.end));
                            start = start.object;
                        }
                        if (start.name) {
                            let p = varTracker[start.name];
                            if (p) {
                                values.push(start.name);
                                values = values.reverse();
                                if (p.type == 'ae') {
                                    values = p.value.concat(values.slice(1));
                                }
                                /*
                                    方法调用
                                    var list=bag.get('list');
                                    if(me.a&&list.hasOwnProperty('xx')){

                                    }
                                 */
                                if (!p.power && !p.md) {
                                    if ((p.dt == 'ArrayExpression' && values.length <= 3) || values.length <= 2) {
                                        return;
                                    }
                                }
                                let left = findLeftRNIndex(tmpl, expr.start);
                                let right = findRightRNIndex(tmpl, expr.end);
                                let near = tmpl.slice(left, right).trim();
                                let uc = uncheck(expr.end);
                                if (!uc) {
                                    memberExpressions.push({
                                        values: values,
                                        start: expr.start,
                                        near: near,
                                        part: tmpl.slice(expr.start, expr.end),
                                        end: expr.end
                                    });
                                }
                            }
                        }
                    }
                }
            } else if (expr.type == 'VariableDeclarator' ||
                expr.type == 'AssignmentExpression') {
                let init, vname;
                if (expr.type == 'VariableDeclarator') {
                    init = expr.init;
                    vname = expr.id.name;
                    if (init) {
                        assign(init, expr, vname, safeguardExpression);
                    }
                } else if (expr.left.type == 'MemberExpression') {
                    let start = expr.left;
                    while (start.object) {
                        start = start.object;
                    }
                    if (start.name && varTracker[start.name]) {
                        let left = findLeftRNIndex(tmpl, expr.start);
                        let right = findRightRNIndex(tmpl, expr.end);
                        let near = tmpl.slice(left, right).trim();
                        maybeError.push({
                            type: 'ao',
                            part: tmpl.slice(expr.start, expr.end),
                            near,
                            pos: expr.start
                        });
                    }
                } else if (expr.left.type == 'Identifier') {
                    init = expr.right;
                    vname = expr.left.name;
                    if (init) {
                        assign(init, expr, vname, safeguardExpression);
                    }
                }
            } else if (expr.type == 'IfStatement') {
                let iftest = expr.test;
                safeguardExpression(iftest, expr);
            }
            if (Array.isArray(expr)) {
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

    //定义的参数都用了，如果某一个没用到，则这个接口也无须请求
    if (Object.keys(paramsObject).length == Object.keys(usedParams).length) {
        memberExpressions.forEach(it => {
            if (it.type == 'bc') { //bag call的调用
                maybeError.push({
                    pos: it.start,
                    near: it.near,
                    part: it.part
                });
            } else {
                let p = getNearestParent(it); //获取保护
                if (p) {
                    let i = 1;
                    let values = it.values;
                    while (i < values.length) { //当前成员路径需要都在保护里，如果不在则可能有问题
                        let key = values.slice(0, i).join('\r');
                        //let vt = varTracker[key];
                        if (!p.safed[key]) {
                            maybeError.push({
                                pos: it.start,
                                near: it.near,
                                part: it.part
                            });
                            break;
                        }
                        i++;
                    }
                } else { //找不到，提示
                    maybeError.push({
                        pos: it.start,
                        near: it.near,
                        part: it.part
                    });
                }
            }
        });
        maybeError.sort((a, b) => {
            return a.pos - b.pos;
        }).forEach(it => {
            if (it.type == 'bc') {
                slog.ever(('avoid use: ' + it.part).red, 'at', e.shortFrom.gray, 'use', it.replacement.red, 'instead');
            } else if (it.type == 'ao') {
                slog.ever(('avoid use: ' + it.part).red, 'at', e.shortFrom.gray, 'more info:', 'https://github.com/thx/magix/issues/38'.magenta);
            } else {
                slog.ever(('may trigger an error: ' + it.part).red, 'at', e.shortFrom.gray, 'near', it.near.magenta);
            }
        });
        //console.log(safeguardMap, '@@@', memberExpressions, '@@@', varTracker, '@@@', safeguard);
    }
};