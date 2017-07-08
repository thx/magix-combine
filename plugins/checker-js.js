let serviceChecker = require('./checker-js-service');
let loopChecker = require('./checker-js-loop');
module.exports = {
    getWalker(comments, tmpl, e) {
        //处理接口调用
        let callChecker = node => {
            serviceChecker(node, comments, tmpl, e);
            loopChecker(node, comments, tmpl, e);
        };
        return {
            FunctionDeclaration: callChecker,
            FunctionExpression: callChecker,
            ArrowFunctionExpression: callChecker
        };
    }
};