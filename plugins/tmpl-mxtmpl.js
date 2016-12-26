/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
 */
var acorn = require('./util-acorn');
var walker = require('./util-acorn-walk');
var tmplCmd = require('./tmpl-cmd');
var configs = require('./util-config');
var Tmpl_Mathcer = /<%([@=!:*])?([\s\S]+?)%>|$/g;
var TagReg = /<(\w+)([^>]*)>/g;
var BindReg = /([@\w-]+)\s*=\s*"<%([:*])([\s\S]+?)%>\s*"/g;
var ComparePattern = /==|>=|<=|>|</;
var SplitExprReg = /\[[^\[\]]+\]|[^.\[\]]+/g;
var MxChangeReg = /\s+mx-change\s*=\s*"([^\(]+)\(([\s\S]*)?\)"/g;
var Anchor = '\u0000';
var NumGetReg = /^\[(\d+)\]$/;
//var IsRadio = /\stype\s*=\s*(['"])radio\1/i;
//var AtAttrNames = {
//    '@disabled': 'disabled',
//    '@checked': 'checked',
//    '@readonly': 'readonly'
//};
//var Tags = {
//    'textarea': 1,
//    'input': 1,
//    'select': 1
//};
module.exports = {
    process: function(tmpl) {
        var fn = [];
        var index = 0;
        tmpl = tmpl.replace(/`/g, Anchor);
        tmpl.replace(Tmpl_Mathcer, function(match, operate, content, offset) {
            var start = 2;
            if (operate) start = 3;
            var source = tmpl.slice(index, offset + start);
            index = offset + match.length - 2;
            fn.push('`' + source + '`;');
            fn.push(content);
        });
        fn = fn.join('');//移除<%%> 使用`变成标签模板分析
        var ast;
        try {
            ast = acorn.parse(fn);
        } catch (e) {
            console.log(e, fn);
        }
        var globalOffset = 0;
        var globalExists = {};
        var globalTracker = {};
        for (var key in configs.tmplGlobalVars) {
            globalExists[key] = 1;
        }
        walker.simple(ast, {
            Identifier: function(node) {
                if (globalExists[node.name] !== 1) {
                    fn = fn.slice(0, globalOffset + node.start) + '$.' + node.name + fn.slice(globalOffset + node.end);
                    globalOffset += 2;
                    globalTracker[node.name] = '$';
                }
            },
            VariableDeclarator: function(node) {
                globalExists[node.id.name] = 1;
                if (node.init) {
                    if (node.init.type == 'Identifier') {
                        globalTracker[node.id.name] = node.init.name;
                    } else if (node.init.type == 'TaggedTemplateExpression') {
                        globalTracker[node.id.name] = node.init.tag.name;
                    }
                }
            }
        });
        fn = fn.replace(/`;?/g, '');
        fn = fn.replace(/\u0000/g, '`');
        var cmdStore = {};
        var analyseExpr = function(expr) {
            var s = expr.split(ComparePattern);
            var left = s[0];
            var ps = left.match(SplitExprReg);
            var start = ps.shift();
            var result = [];
            if (start != '$') {
                var b = start.trim();
                while (globalTracker[b] != '$') {
                    b = globalTracker[b];
                }
                result.push(b);
                result.push.apply(result, ps);
            } else {
                result = ps;
            }
            for (var i = 0; i < result.length; i++) {
                result[i] = result[i].replace(NumGetReg, '$1').trim();
            }
            result = result.join('.');
            result = result.replace(/\[/g, '<%!').replace(/\]/g, '%>');
            return result;
        };
        fn = tmplCmd.store(fn, cmdStore);
        fn = fn.replace(TagReg, function(match, tag, attrs) {
            var ext = '';
            var mxChangeAttr = '';
            attrs = attrs.replace(MxChangeReg, function(m, name, params) {
                ext = ',m:\'' + name + '\',a:' + (params || '{}');
                return (mxChangeAttr = m);
            });
            attrs = tmplCmd.recover(attrs, cmdStore);
            var hasBound = false;
            attrs = attrs.replace(BindReg, function(m, name, flag, expr) {
                if (hasBound) {
                    console.error('unsupport multi bind', expr, attrs);
                    return '';
                }
                hasBound = true;
                expr = analyseExpr(expr);
                // if (Tags[tag] && AtAttrNames[name] && !IsRadio.test(attrs)) {
                //     ext += ',x:\'' + AtAttrNames[name] + '\'';
                // }
                expr = ' mx-change="s\u0011e\u0011t({p:\'' + expr + '\'' + ext + '})"';
                if (flag == ':') {
                    m = m.replace('<%:', '<%=');
                } else {
                    m = '';
                }
                return m + expr;
            });
            if (hasBound) {
                attrs = attrs.replace(mxChangeAttr, '');
            }
            return '<' + tag + attrs + '>';
        });
        fn = tmplCmd.recover(fn, cmdStore);
        return fn;
    }
};