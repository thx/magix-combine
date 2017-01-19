/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
 */
var acorn = require('./util-acorn');
var walker = require('./util-acorn-walk');
var tmplCmd = require('./tmpl-cmd');
var configs = require('./util-config');
var Tmpl_Mathcer = /<%([@=!:])?([\s\S]+?)%>|$/g;
var TagReg = /<(\w+)([^>]*)>/g;
var BindReg = /([\w\-]+)\s*=\s*(["'])\s*<%:([\s\S]+?)%>\s*\2/g;
var BingReg2 = /\s*<%:([\s\S]+?)%>\s*/g;
var SplitExprReg = /\[[^\[\]]+\]|[^.\[\]]+/g;
var MxChangeReg = /\s+mx-change\s*=\s*"([^\(]+)\(([\s\S]*)?\)"/g;
var Anchor = '\u0000';
var NumGetReg = /^\[(\d+)\]$/;
module.exports = {
    process: function(tmpl) {
        var fn = [];
        var index = 0;
        tmpl = tmpl.replace(/`/g, Anchor);
        tmpl.replace(Tmpl_Mathcer, function(match, operate, content, offset) {
            var start = 2;
            if (operate) {
                start = 3;
                content = '(' + content + ')';
            }
            var source = tmpl.slice(index, offset + start);
            index = offset + match.length - 2;
            fn.push('`' + source + '`;');
            fn.push(content);
        });
        fn = fn.join(''); //移除<%%> 使用`变成标签模板分析
        var ast;
        //console.log(fn);
        //return;
        try {
            ast = acorn.parse(fn);
        } catch (e) {
            console.log('parse ast error', e, fn);
        }
        var globalExists = {};
        var globalTracker = {};
        for (var key in configs.tmplGlobalVars) {
            globalExists[key] = 1;
        }
        /*
            变量和变量声明在ast里面遍历的顺序不一致，需要对位置信息保存后再修改fn
         */
        var modifiers = [];
        var fnProcessor = function(node) {
            if (node.type == 'FunctionDeclaration') {
                globalExists[node.id.name] = 1;
            }
            var params = {};
            for (var i = 0, p; i < node.params.length; i++) {
                p = node.params[i];
                params[p.name] = 1;
            }
            var walk = function(expr) {
                if (expr) {
                    if (expr.type == 'Identifier') {
                        if (params[expr.name]) { //如果在参数里，移除修改器里面的，该参数保持不变
                            for (var j = modifiers.length - 1; j >= 0; j--) {
                                var m = modifiers[j];
                                if (expr.start == m.start) {
                                    modifiers.splice(j, 1);
                                    break;
                                }
                            }
                        }
                    } else if (Array.isArray(expr)) {
                        for (var i = 0; i < expr.length; i++) {
                            walk(expr[i]);
                        }
                    } else if (expr instanceof Object) {
                        for (var p in expr) {
                            walk(expr[p]);
                        }
                    }
                }
            };
            walk(node.body.body);
        };
        walker.simple(ast, {
            Identifier: function(node) {
                if (globalExists[node.name] !== 1) {
                    modifiers.push({
                        key: '\u0003.',
                        start: node.start,
                        end: node.end,
                        name: node.name
                    });
                    globalTracker[node.name] = '\u0003';
                } else {
                    if (!configs.tmplGlobalVars[node.name]) {
                        modifiers.push({
                            key: '\u0001',
                            start: node.start,
                            end: node.end,
                            name: node.name
                        });
                    }
                }
            },
            VariableDeclarator: function(node) {
                globalExists[node.id.name] = 1;
                modifiers.push({
                    key: '\u0002',
                    start: node.id.start,
                    end: node.id.end,
                    name: node.id.name
                });
                if (node.init) {
                    if (node.init.type == 'Identifier') {
                        globalTracker[node.id.name] = node.init.name;
                    } else if (node.init.type == 'TaggedTemplateExpression') {
                        globalTracker[node.id.name] = node.init.tag.name;
                    }
                }
            },
            FunctionDeclaration: fnProcessor,
            FunctionExpression: fnProcessor
        });
        modifiers.sort(function(a, b) { //根据start大小排序，这样修改后的fn才是正确的
            return a.start - b.start;
        });
        for (var i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            fn = fn.slice(0, m.start) + m.key + m.name + fn.slice(m.end);
        }
        //console.log(fn, modifiers);
        fn = fn.replace(/`;?/g, '');
        fn = fn.replace(/\u0000/g, '`');
        fn = fn.replace(Tmpl_Mathcer, function(match, operate, content) {
            if (operate) {
                return '<%' + operate + content.slice(1, -1) + '%>';
            }
            return match;
        });
        var max = 100;
        var cmdStore = {};
        var analyseExpr = function(expr) {
            var ps = expr.match(SplitExprReg);
            var start = ps.shift();
            var result = [];
            if (start != '\u0003') {
                var b = start.trim();
                while (globalTracker[b] != '\u0003') {
                    b = globalTracker[b];
                    max--;
                    if (!max) {
                        console.error('analyseExpr # can not analysis:', expr);
                        break;
                    }
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
                return (mxChangeAttr = tmplCmd.recover(m, cmdStore));
            });
            attrs = tmplCmd.recover(attrs, cmdStore);
            var hasBound = false;
            attrs = attrs.replace(BindReg, function(m, name, q, expr) {
                expr = expr.trim();
                if (hasBound) {
                    console.error('unsupport multi bind', expr, attrs);
                    return '';
                }
                hasBound = true;
                expr = analyseExpr(expr);
                expr = ' mx-change="s\u0011e\u0011t({p:\'' + expr + '\'' + ext + '})"';
                m = m.replace('<%:', '<%=');
                return m + expr;
            }).replace(BingReg2, function(m, expr) {
                expr = expr.trim();
                if (hasBound) {
                    console.error('unsupport multi bind', expr, attrs);
                    return '';
                }
                hasBound = true;
                expr = analyseExpr(expr);
                expr = ' mx-change="s\u0011e\u0011t({p:\'' + expr + '\'' + ext + '})"';
                return expr;
            });
            if (hasBound) {
                attrs = attrs.replace(mxChangeAttr, '');
            }
            return '<' + tag + attrs + '>';
        });
        fn = tmplCmd.recover(fn, cmdStore);
        //console.log(fn);
        return fn;
    }
};