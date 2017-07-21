/*
    js代码检测入口
    1.　检测接口数据的使用
    2.　检测循环嵌套
 */
let serviceChecker = require('./checker-js-service');
let loopChecker = require('./checker-js-loop');
let thisChecker = require('./checker-js-this');
let configs = require('./util-config');
module.exports = {
    getWalker(comments, tmpl, e) {
        let ref = {
            thisAlias: configs.thisAlias,
            settingsAlias: configs.thisAlias
        };
        //处理接口调用
        let callChecker = node => {
            if (configs.checker.jsService) {
                serviceChecker(node, comments, tmpl, e);
            }
            if (configs.checker.jsLoop) {
                loopChecker(node, comments, tmpl, e);
            }
            if (!e.vendorCompile && configs.checker.jsThis) {
                thisChecker(node, tmpl, e, ref); //this有可能被第三方编译工具编译，所以当第三方编译后的js代码不去检测
            }
        };
        return {
            FunctionDeclaration: callChecker,
            FunctionExpression: callChecker,
            ArrowFunctionExpression: callChecker
        };
    }
};