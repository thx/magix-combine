/*
    检测js代码中this的别名，确保统一
 */
/*
    var me=this;
    var me;
    me=this;
    var c=this;//提示
    var b=me;//提示
    var b;
    b=me;//提示

    ------
    var me=this;
    var me=this;//提示
    me=this;//提示
    ------
    var me=this;
    var that=this;//提示


    ------
    var a={
        f1(){
            var me=this;
        },
        f2(){
            var that=this;//提示
        }
    }
 */
let slog = require('./util-log');
module.exports = (node, tmpl, e, ref) => {
    let exprs = [];
    let varTracker = Object.create(null);
    let walk = (expr) => {
        if (Array.isArray(expr) || expr instanceof Object) {
            switch (expr.type) {
                case 'AssignmentExpression':
                    if (expr.left.type == 'Identifier') {
                        if (expr.right.type == 'ThisExpression') { //this赋值
                            if (!ref.thisAlias) { //当前文件还未查找到this别名
                                ref.thisAlias = expr.left.name;
                            }
                            if (expr.left.name != ref.thisAlias) { //如果左侧不与之前的相同，则提示，保持同一个文件中的this别名统一
                                exprs.push({
                                    tip: 'keep same this alias',
                                    start: expr.start,
                                    end: expr.end,
                                    prev: ref.thisAlias
                                });
                            } else if (varTracker[expr.left.name]) { //赋值时同名的已经存在，如var me=this;me=this;
                                exprs.push({
                                    tip: 'this alias already exists',
                                    start: expr.start,
                                    end: expr.end
                                });
                            }
                            varTracker[expr.left.name] = 1;
                        } else if (expr.right.type == 'Identifier' && varTracker[expr.right.name]) { //把this的别名再赋给其它变量。如var me=this;var b;b=me;
                            exprs.push({
                                tip: 'avoid reassign this alias',
                                start: expr.start,
                                end: expr.end
                            });
                            varTracker[expr.left.name] = 1;
                        }
                    }
                    break;
                case 'VariableDeclarator':
                    if (expr.init) {
                        if (expr.init.type == 'ThisExpression') {
                            if (!ref.thisAlias) {
                                ref.thisAlias = expr.id.name;
                            }
                            if (expr.id.name != ref.thisAlias) { //如果声明的变量名不与之前的相同
                                exprs.push({
                                    tip: 'keep same this alias',
                                    start: expr.start,
                                    end: expr.end,
                                    prev: ref.thisAlias
                                });
                            }
                            if (varTracker[expr.id.name]) { //重复声明，如var me=this;var me=this;
                                exprs.push({
                                    tip: 'avoid redeclare',
                                    start: expr.start,
                                    end: expr.end
                                });
                            }
                            varTracker[expr.id.name] = 1;
                        } else if (expr.init.type == 'Identifier' && varTracker[expr.init.name]) { //把this别名的变量赋给其它变量
                            exprs.push({
                                tip: 'avoid reassign this alias',
                                start: expr.start,
                                end: expr.end
                            });
                            varTracker[expr.id.name] = 1;
                        }
                    }
                    break;
            }
            if (expr.type != 'FunctionDeclaration' &&
                expr.type != 'FunctionExpression' &&
                expr.type != 'ArrowFunctionExpression') {
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
        }
    };
    walk(node.body.body);
    let msg = ref.settingsAlias ? 'global settings is: ' : 'prev you used: ';
    exprs.forEach(expr => {
        let part = tmpl.slice(expr.start, expr.end);
        slog.ever(expr.tip.red, 'at', e.shortFrom.gray, 'near', part.magenta, expr.prev ? msg + expr.prev.red : '');
    });
};