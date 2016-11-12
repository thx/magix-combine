/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
 */
var acorn = require('./util-acorn');
var walker = require('./util-acorn-walk');
var Tmpl_Mathcer = /<%([@=!])?([\s\S]+?)%>|$/g;
var anchor = '\u0000';
module.exports = {
    process: function(tmpl) {
        var fn = [];
        var index = 0;
        tmpl = tmpl.replace(/`/g, anchor);
        tmpl.replace(Tmpl_Mathcer, function(match, operate, content, offset) {
            var start = 2;
            if (operate) start = 3;
            var source = tmpl.slice(index, offset + start);
            index = offset + match.length - 2;
            fn.push('`' + source + '`;');
            fn.push(content);
        });
        fn = fn.join('');
        var t = acorn.parse(fn);
        var globalOffset = 0;
        var globalExists = {};
        walker.simple(t, {
            Identifier: function(node) {
                if (globalExists[node.name] !== 1) {
                    fn = fn.slice(0, globalOffset + node.start) + '$.' + node.name + fn.slice(globalOffset + node.end);
                    globalOffset += 2;
                }
            },
            VariableDeclarator: function(node) {
                globalExists[node.id.name] = 1;
            }
        });
        fn = fn.replace(/`;?/g, '');
        fn = fn.replace(/\u0000/g, '`');
        return fn;
    }
};