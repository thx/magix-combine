let serviceChecker = require('./checker-js-service');
let loopChecker = require('./checker-js-loop');
module.exports = {
    getWalker(comments, tmpl, e) {
        //处理接口调用
        let callServiceChecker = node => {
            serviceChecker(node, comments, tmpl, e);
            loopChecker(node, comments, tmpl, e);
        };
        return {
            FunctionDeclaration: callServiceChecker,
            FunctionExpression: callServiceChecker,
            ArrowFunctionExpression: callServiceChecker/*,
            ForStatement: callLoopChecker,
            WhileStatement: callLoopChecker,
            DoWhileStatement: callLoopChecker,
            ForOfStatement: callLoopChecker*/
        };
    }
};