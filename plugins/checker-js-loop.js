/*
    检测js代码中的循环嵌套，在以往的代码review中，通常3层以上的循环都可以通过合理的数据结构避免
 */
let slog = require('./util-log');
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
module.exports = (node, comments, tmpl, e) => {
    let outerExprs = [];
    let addedOuterExprs = Object.create(null);
    let enterFns = Object.create(null);
    let uncheck = p => {
        while (--p > 0) {
            if (comments[p]) {
                if (comments[p].text == 'mc-uncheck') {
                    return true;
                }
            }
            let c = tmpl.charAt(p);
            if (c != ' ' && c != ';' && c != '\r' && c != '\n' && c != '\t') {
                return false;
            }
        }
    };
    let take = (lc, expr) => {
        if (lc > 2) {
            let key = expr.start + '@' + expr.end;
            if (!addedOuterExprs[key]) {
                addedOuterExprs[key] = 1;
                outerExprs.push(expr);
            }
            return false;
        }
        return true;
    };
    let walk = (expr, lc, outerLoop) => {
        if (Array.isArray(expr) || expr instanceof Object) {
            let walkSub = true;
            switch (expr.type) {
                case 'ForStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                case 'ForOfStatement':
                case 'ForInStatement':
                    if (!uncheck(expr.start)) {
                        if (!outerLoop) {
                            outerLoop = expr;
                        }
                        lc++;
                        walkSub = take(lc, outerLoop);
                    }
                    break;
                case 'CallExpression': //检测是否是[].forEach  _.each $.each调用
                    let args = expr.arguments;
                    if (args && args.length > 1) {
                        let a0 = args[0];
                        let a1 = args[1];
                        if (a0.type == 'FunctionExpression' ||
                            a0.type == 'ArrowFunctionExpression' ||
                            (a1 && (a1.type == 'FunctionExpression' ||
                                a1.type == 'ArrowFunctionExpression'))) {
                            let callee = expr.callee;
                            if (callee.type == 'MemberExpression') {
                                let p = callee.property;
                                if (loopNames.hasOwnProperty(p.name)) {
                                    let key = a0.start + '@' + a0.end;
                                    enterFns[key] = 1;
                                    if (!uncheck(expr.start)) {
                                        if (!outerLoop) {
                                            outerLoop = expr;
                                        }
                                        lc++;
                                        walkSub = take(lc, outerLoop);
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
            let key = expr.start + '@' + expr.end;
            if (walkSub && (enterFns[key] || (
                    expr.type != 'FunctionDeclaration' &&
                    expr.type != 'FunctionExpression' &&
                    expr.type != 'ArrowFunctionExpression'))) {
                if (Array.isArray(expr)) {
                    for (let i = 0; i < expr.length; i++) {
                        walk(expr[i], lc, outerLoop);
                    }
                } else if (expr instanceof Object) {
                    for (let p in expr) {
                        walk(expr[p], lc, outerLoop);
                    }
                }
            }
        }
    };
    walk(node.body.body, 0);
    outerExprs.forEach(expr => {
        let part = tmpl.slice(expr.start, expr.end);
        slog.ever('avoid nested loops'.red, 'at', e.shortFrom.gray, 'near', part.magenta);
    });
};