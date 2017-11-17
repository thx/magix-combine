/*
    模板指令处理
 */

let chalk = require('chalk');
let configs = require('./util-config');
let htmlminifier = require('html-minifier');
let jm = require('./js-min');
let attrObject = require('./tmpl-attr-object');
let slog = require('./util-log');
let tmplParser = require('./tmpl-parser');
//模板文件，模板引擎命令处理，因为我们用的是字符串模板，常见的模板命令如<%=output%> {{output}}，这种通常会影响我们的分析，我们先把它们做替换处理
let anchor = '\u0007';
let tmplCommandAnchorCompressReg = /(\u0007\d+\u0007)\s+(?=[<>])/g;
let tmplCommandAnchorCompressReg2 = /([<>])\s+(\u0007\d+\u0007)/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let tmplCmdReg = /<%([@=!:~#])?([\s\S]+?)%>|$/g;
let outputCmdReg = /<%([=!@:~#])?([\s\S]*?)%>/g;
let phCmdReg = /\u0000\d+\u0000/g;
let phAllCmdReg = /([\u0000\u0001])\d+\1/g;
let continuedCmdReg = /(?:\s*\u0000\d+\u0000\s*){2,}/g;
let bwCmdReg = /%><%/g;
let bwSpaceCmdReg = /%>\s*<%/g;
let blockCmdReg = /([\{\}]);/g;
let continuedSemicolonReg = /;+/g;
let emptyCmdReg = /<%\s*%>/g;
let phKey = '\u0000';
let outPhKey = '\u0001';
let borderChars = /^\s*<%[\{\}\(\)\[\];\s]+%>\s*$/;

let bindReg2 = /(\s*)<%:([\s\S]+?)%>(\s*)/g;
let bindEventsReg = /^\s*\[([^\[\]]+)\]\s*/;
let bindEventsReg2 = /^([^<>]+)<([^>]+)>/;

let lineBreakReg = /\r\n?|\n|\u2028|\u2029/;


module.exports = {
    compile(tmpl) {
        if (!configs.disableMagixUpdater) {
            let tps = [];
            let index = 0;
            let htmlIndex = 0;
            let htmlStore = Object.create(null);
            //特殊处理绑定事件及参数
            tmpl = tmpl.replace(bindReg2, (m, left, expr, right) => {
                let leftBrace = expr.indexOf('{');
                if (leftBrace > 0) {
                    let fns = expr.slice(leftBrace);
                    //console.log(fns);
                    try {
                        fns = ',' + attrObject.parseObject(fns, '\u0017', '\u0018');
                        //console.log(fns);
                    } catch (ex) {
                        slog.ever(chalk.red('check:' + fns));
                    }
                    expr = expr.slice(0, leftBrace) + fns;
                }
                if (bindEventsReg.test(expr)) {
                    expr = expr.replace(bindEventsReg, '"\u0017$1",');
                } else if (bindEventsReg2.test(expr)) {
                    expr = expr.replace(bindEventsReg2, '"\u0017$2",$1');
                }
                return (left || '') + '<%:' + expr + '%>' + (right || '');
            });
            tmpl.replace(tmplCmdReg, (match, operate, content, offset) => {
                let start = 2;
                if (operate) {
                    start = 3;
                    content = '(' + content + ')';
                }
                let source = tmpl.slice(index, offset + start);
                let key = '\u0005' + (htmlIndex++) + '\u0005';
                htmlStore[key] = source;
                index = offset + match.length - 2;
                tps.push(';"', key, '";', content);
                index = offset + match.length - 2;
            });
            tmpl = configs.compileTmplCommand(tps.join(''), configs);
            tmpl = tmpl.replace(/(?:\s*;\s*"\u0005|\u0005"\s*;\s*)/g, '\u0005');
            tmpl = tmpl.replace(/\u0005\d+\u0005/g, m => htmlStore[m]);
            tmpl = tmpl.replace(outputCmdReg, (m, o, c) => {
                //还原格式
                if (o) {
                    c = c.slice(1, -1);
                }
                c = jm.min(c).replace(lineBreakReg, '');
                return '<%' + (o || '') + c + '%>';
            });
            tmpl = tmpl.replace(emptyCmdReg, '');
        }
        return tmpl;
    },
    compress(tmpl) { //对模板引擎命令的压缩，如<%if(){%><%}else{%><%}%>这种完全可以压缩成<%if(){ }else{ }%>，因为项目中模板引擎不固定，所以这个需要外部实现
        if (!configs.disableMagixUpdater) {
            let stores = Object.create(null),
                idx = 1;
            //下面这行是压缩模板命令，删除可能存在的空格
            // tmpl = tmpl.replace(outputCmdReg, (m, oper, content) => {
            //     return '<%' + (oper || '') + jm.jsmin(content) + '%>';
            // });
            //存储非输出命令(控制命令)
            /*tmpl = tmpl.replace(outputCmdReg, (m, o, c) => {
                if (o) {
                    if (o == '@') {
                        return '<%$p+=$i(' + c + ')%>';
                    } else if (o == '=') {
                        return '<%$p+=$e(' + c + ')%>';
                    } else if (o == '!') {
                        return '<%$p+=$n(' + c + ')%>';
                    }
                }
                return m;
            });*/
            tmpl = tmpl.replace(outputCmdReg, (m, o, c, k) => {
                k = o ? outPhKey : phKey;
                k = k + (idx++) + k; //占位符
                stores[k] = m; //存储
                return k;
            });
            if (!configs.debug) {
                tmpl = '<mxv-root>' + tmpl + '</mxv-root>';
                let tokens = tmplParser(tmpl);
                let modifiers = [];
                let recordContent = n => {
                    let c = tmpl.slice(n.contentStart, n.contentEnd);
                    if (c) {
                        let current = {
                            start: n.contentStart
                        };
                        if (n.children) {
                            for (let r of n.children) {
                                current.end = r.start;
                                if (current.start != current.end) {
                                    modifiers.push(current);
                                }
                                current = {
                                    start: r.end
                                };
                            }
                        }
                        current.end = n.contentEnd;
                        if (current.start != current.end) {
                            modifiers.push(current);
                        }
                    }
                };
                let walk = nodes => {
                    for (let n of nodes) {
                        if (n.hasContent) {
                            if (n.children) {
                                walk(n.children);
                            }
                            recordContent(n);
                        }
                    }
                };
                walk(tokens);
                modifiers.sort((a, b) => a.start - b.start);
                for (let m, i = modifiers.length; i--;) {
                    m = modifiers[i];
                    let c = tmpl.slice(m.start, m.end);
                    c = c.replace(continuedCmdReg, m => {
                        m = m.replace(phCmdReg, n => stores[n]) //命令还原
                            .replace(bwSpaceCmdReg, ';')
                            .replace(blockCmdReg, '$1')
                            .replace(continuedSemicolonReg, ';'); //删除中间的%><%及分号
                        return m;
                    });
                    tmpl = tmpl.slice(0, m.start) + c + tmpl.slice(m.end);
                }
                tmpl = tmpl.slice(10, -11);
                //console.log(JSON.stringify(tmpl));
                //把多个连续的控制命令做压缩
                tmpl = tmpl.replace(continuedCmdReg, m => {
                    m = m.replace(phCmdReg, n => stores[n]) //命令还原
                        .replace(bwCmdReg, ';')
                        .replace(blockCmdReg, '$1')
                        .replace(continuedSemicolonReg, ';'); //删除中间的%><%及分号
                    return m;
                });
            }
            tmpl = tmpl.replace(phAllCmdReg, n => stores[n]); //其它命令还原
            tmpl = tmpl.replace(tmplCmdReg, m => {
                if (borderChars.test(m)) { //删除不必要的分号
                    m = m.replace(continuedSemicolonReg, '');
                }
                return m;
            });
        }
        return tmpl;
    },
    store(tmpl, dataset) { //保存模板引擎命令
        let idx = dataset.___idx || 0;
        if (configs.tmplCommand) {
            tmpl = tmpl.replace(configs.tmplCommand, (match, key) => {
                idx++;
                key = anchor + idx + anchor;
                dataset[match] = key;
                dataset[key] = match;
                dataset.___idx = idx;
                return key;
            });
        }
        return tmpl;
    },
    tidy(tmpl) { //简单压缩
        tmpl = htmlminifier.minify(tmpl, configs.htmlminifier);
        if (configs.htmlminifier.collapseWhitespace) {
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg, '$1');
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg2, '$1$2');
        }
        return tmpl;
    },
    recover(tmpl, refTmplCommands, processor) { //恢复替换的命令
        return tmpl.replace(tmplCommandAnchorReg, match => {
            let value = refTmplCommands[match];
            if (processor) {
                value = processor(value);
            }
            return value;
        });
    }
};