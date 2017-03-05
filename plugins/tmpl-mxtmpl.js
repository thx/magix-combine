/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
 */
var util = require('util');
var acorn = require('./util-acorn');
var walker = require('./util-acorn-walk');
var tmplCmd = require('./tmpl-cmd');
var configs = require('./util-config');
var Tmpl_Mathcer = /<%([@=!:~])?([\s\S]+?)%>|$/g;
var TagReg = /<(\w+)([^>]*)>/g;
var BindReg = /([\w\-]+)\s*=\s*(["'])\s*<%:([\s\S]+?)%>\s*\2/g;
var BindReg2 = /\s*<%:([\s\S]+?)%>\s*/g;
var PathReg = /<%~([\s\S]+?)%>/g;
var SplitExprReg = /\[[^\[\]]+\]|[^.\[\]]+/g;
var NumGetReg = /^\[(\d+)\]$/;
var TextaraReg = /<textarea([^>]*)>([\s\S]*?)<\/textarea>/g;
var CReg = /[用声全未]/g;
var HReg = /([\u0001\u0002])\d+/g;
var HtmlHolderReg = /\u0005\d+\u0005/g;
var SCharReg = /(?:`;|;`)/g;
var StringReg = /^['"]/;
var CMap = {
    '用': '\u0001',
    '声': '\u0002',
    '全': '\u0003',
    '未': '\u0006'
};
var StripChar = function(str) {
    return str.replace(CReg, function(m) {
        return CMap[m];
    });
};
var StripNum = function(str) {
    return str.replace(HReg, '$1');
};
var GenEventReg = function(type) {
    var reg = GenEventReg[type];
    if (!reg) {
        reg = new RegExp('\\bmx-' + type + '\\s*=\\s*"([^\\(]+)\\(([\\s\\S]*?)\\)"');
        GenEventReg[type] = reg;
    }
    reg.lastIndex = 0;
    return reg;
};
/*
    \u0000  `反撇
    \u0001  模板中局部变量  用
    \u0002  变量声明的地方  声
    \u0003  模板中全局变量  全
    \u0004  命令中的字符串
    \u0005  html中的字符串
    \u0006  unchangableVars
    第一遍用汉字
    第二遍用不可见字符
 */
module.exports = {
    process: function(tmpl, reject, sourceFile) {
        var fn = [];
        var index = 0;
        var htmlStore = {};
        var htmlIndex = 0;
        tmpl.replace(Tmpl_Mathcer, function(match, operate, content, offset) {
            var start = 2;
            if (operate) {
                start = 3;
                content = '(' + content + ')';
            }
            var source = tmpl.slice(index, offset + start);
            var key = '\u0005' + (htmlIndex++) + '\u0005';
            htmlStore[key] = source;
            index = offset + match.length - 2;
            fn.push(';`' + key + '`;', content);
        });
        fn = fn.join(''); //移除<%%> 使用`变成标签模板分析
        var ast;
        var recoverHTML = function(fn) {
            fn = fn.replace(SCharReg, '');
            fn = fn.replace(HtmlHolderReg, function(m) {
                return htmlStore[m];
            });
            return fn;
        };
        //console.log('x', fn);
        //return;

        try {
            ast = acorn.parse(fn);
        } catch (ex) {
            console.log('parse html cmd ast error:', ex.message.red);
            var html = recoverHTML(fn.slice(Math.max(ex.loc.column - 5, 0)));
            console.log('near html:', (html.slice(0, 200)).green);
            console.log('html file:', sourceFile.red);
            reject(ex.message);
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
        var stringStore = {};
        var stringIndex = 0;
        var recoverString = function(tmpl) {
            return tmpl.replace(/(['"])(\u0004\d+\u0004)\1/g, function(m, q, c) {
                return stringStore[c];
            });
        };
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
        var unchangableVars = configs.tmplUnchangableVars;
        var processString = function(node) { //存储字符串，减少分析干扰
            StringReg.lastIndex = 0;
            if (StringReg.test(node.raw)) {
                var q = node.raw.match(StringReg)[0];
                var key = '\u0004' + (stringIndex++) + '\u0004';
                stringStore[key] = node.raw;
                modifiers.push({
                    key: '',
                    start: node.start,
                    end: node.end,
                    name: q + key + q
                });
            }
        };
        walker.simple(ast, {
            Property: function(node) {
                StringReg.lastIndex = 0;
                if (node.key.type == 'Literal') {
                    processString(node.key);
                }
            },
            Literal: processString,
            Identifier: function(node) {
                if (globalExists[node.name] !== 1) {
                    modifiers.push({
                        key: (unchangableVars[node.name] ? '未' : '全') + '.',
                        start: node.start,
                        end: node.end,
                        name: node.name
                    });
                } else {
                    if (!configs.tmplGlobalVars[node.name]) {
                        modifiers.push({
                            key: '用' + node.end,
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
                    key: '声' + node.start,
                    start: node.id.start,
                    end: node.id.end,
                    name: node.id.name
                });
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
        ast = acorn.parse(fn);
        walker.simple(ast, {
            VariableDeclarator: function(node) {
                if (node.init) {
                    var key = StripChar(node.id.name);
                    var pos = key.match(/\u0002(\d+)/)[1];
                    key = key.replace(/\u0002\d+/, '\u0001');
                    var value = StripChar(fn.slice(node.init.start, node.init.end));
                    if (!globalTracker[key]) {
                        globalTracker[key] = [];
                    }
                    globalTracker[key].push({
                        pos: pos | 0,
                        value: value
                    });
                }
            }
        });
        //fn = StripChar(fn);
        fn = fn.replace(SCharReg, '');
        fn = StripChar(fn);

        fn = fn.replace(HtmlHolderReg, function(m) {
            return htmlStore[m];
        });
        fn = fn.replace(Tmpl_Mathcer, function(match, operate, content) {
            if (operate) {
                return '<%' + operate + content.slice(1, -1) + '%>';
            }
            return match; //移除代码中的汉字
        });
        var cmdStore = {};
        var best = function(head) {
            var match = head.match(/\u0001(\d+)/);
            if (!match) return null;
            var pos = match[1];
            pos = pos | 0;
            var key = head.replace(/\u0001\d+/, '\u0001');
            var list = globalTracker[key];
            if (!list) return null;
            for (var i = list.length - 1, item; i >= 0; i--) {
                item = list[i];
                if (item.pos < pos) {
                    return item.value;
                }
            }
            return null;
        };
        var find = function(expr, srcExpr) {
            if (!srcExpr) {
                srcExpr = expr;
            }
            var ps = expr.match(SplitExprReg);
            var head = ps[0];
            if (head == '\u0003') {
                return ps.slice(1);
            }
            var info = best(head);
            if (!info) {
                console.log(('analyseExpr # can not analysis:' + srcExpr).red);
                return ['analysisError'];
            }
            if (info != '\u0003') {
                ps = find(info, srcExpr).concat(ps.slice(1));
            }
            return ps; //.join('.');
        };
        var analyseExpr = function(expr) {
            var result = find(expr);
            for (var i = 0; i < result.length; i++) {
                result[i] = result[i].replace(NumGetReg, '$1').trim();
            }
            result = result.join('.');
            result = result.replace(/\[/g, '<%!').replace(/\]/g, '%>');
            return result;
        };
        fn = tmplCmd.store(fn, cmdStore);
        fn = fn.replace(TextaraReg, function(match, attr, content) {
            attr = tmplCmd.recover(attr, cmdStore);
            content = tmplCmd.recover(content, cmdStore);
            if (BindReg2.test(content)) {
                var bind = '';
                content = content.replace(BindReg2, function(m) {
                    bind = m;
                    return m.replace('<%:', '<%=');
                });
                attr = attr + ' ' + bind;
            }
            content = tmplCmd.store(content, cmdStore);
            attr = tmplCmd.store(attr, cmdStore);
            return '<textarea' + attr + '>' + content + '</textarea>';
        });
        fn = fn.replace(TagReg, function(match, tag, attrs) {
            var bindEvents = configs.bindEvents;
            var oldEvents = {};
            var e;
            attrs = tmplCmd.recover(attrs, cmdStore);
            var replacement = function(m, name, params) {
                var now = ',m:\'' + name + '\',a:' + (params || '{}');
                var old = m; //tmplCmd.recover(m, cmdStore);
                oldEvents[e] = {
                    old: old,
                    now: now
                };
                return old;
            };
            for (var i = 0; i < bindEvents.length; i++) {
                e = bindEvents[i];
                var reg = GenEventReg(e);
                attrs = attrs.replace(reg, replacement);
            }
            var findCount = 0;
            attrs = attrs.replace(BindReg, function(m, name, q, expr) {
                expr = expr.trim();
                if (findCount > 1) {
                    console.log('unsupport multi bind', expr, attrs, tmplCmd.recover(match, cmdStore), ' relate file:', sourceFile.gray);
                    return '';
                }
                findCount++;
                expr = analyseExpr(expr);
                var now = '',
                    info;
                for (i = 0; i < bindEvents.length; i++) {
                    e = bindEvents[i];
                    info = oldEvents[e];
                    now += '  mx-' + e + '="' + configs.bindName + '({p:\'' + expr + '\'' + (info ? info.now : '') + '})"';
                }
                m = m.replace('<%:', '<%=');
                return m + now;
            }).replace(BindReg2, function(m, expr) {
                expr = expr.trim();
                if (findCount > 1) {
                    console.log('unsupport multi bind', expr, attrs, tmplCmd.recover(match, cmdStore), ' relate file:', sourceFile.gray);
                    return '';
                }
                findCount++;
                expr = analyseExpr(expr);
                var now = '',
                    info;
                for (i = 0; i < bindEvents.length; i++) {
                    e = bindEvents[i];
                    info = oldEvents[e];
                    now += '  mx-' + e + '="s\u0011e\u0011t({p:\'' + expr + '\'' + (info ? info.now : '') + '})"';
                }
                return now;
            }).replace(PathReg, function(m, expr) {
                expr = expr.trim();
                expr = analyseExpr(expr);
                return expr;
            }).replace(Tmpl_Mathcer, function(m) {
                return StripNum(m);
            });
            if (findCount > 0) {
                for (i = 0; i < bindEvents.length; i++) {
                    e = oldEvents[bindEvents[i]];
                    if (e) {
                        attrs = attrs.replace(e.old, '');
                    }
                }
            }
            return '<' + tag + attrs + '>';
        });

        for (var p in cmdStore) {
            var cmd = cmdStore[p];
            if (util.isString(cmd)) {
                cmd = recoverString(StripNum(cmd)); //移除命令中的数字和恢复字符串
            }
            cmdStore[p] = cmd;
        }
        fn = tmplCmd.recover(fn, cmdStore);
        //console.log(fn);
        return fn;
    }
};