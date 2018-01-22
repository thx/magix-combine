/*
    js代码检测入口
    1.　检测接口数据的使用
    2.　检测循环嵌套
 */
let acorn = require('./js-acorn');
let serviceChecker = require('./checker-js-service');
let loopChecker = require('./checker-js-loop');
//let thisChecker = require('./checker-js-this');
module.exports = {
    check(comments, tmpl, e, ast) {
        if (tmpl.length > 50 * 2 << 9) return;//文件太大
        /*let ref = {
            thisAlias: e.thisAlias,
            settingsAlias: e.thisAlias
        };*/
        //处理接口调用
        let callChecker = node => {
            if (e.checker.jsLoop) {
                loopChecker(node, comments, tmpl, e);
            }
            /*if (e.checker.jsThis) {
                thisChecker(node, tmpl, e, ref); //this有可能被第三方编译工具编译，所以当第三方编译后的js代码不去检测
            }*/
            if (e.checker.jsService) {
                serviceChecker(node, comments, tmpl, e);
            }
        };
        acorn.walk(ast, {
            FunctionDeclaration: callChecker,
            FunctionExpression: callChecker,
            ArrowFunctionExpression: callChecker
        });
    }
};