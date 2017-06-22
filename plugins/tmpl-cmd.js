let configs = require('./util-config');
let htmlminifier = require('html-minifier');
let jm = require('./js-min');
//模板文件，模板引擎命令处理，因为我们用的是字符串模板，常见的模板命令如<%=output%> {{output}}，这种通常会影响我们的分析，我们先把它们做替换处理
let anchor = '\u0007';
let tmplCommandAnchorCompressReg = /(\u0007\d+\u0007)\s+(?=[<>])/g;
let tmplCommandAnchorCompressReg2 = /([<>])\s+(\u0007\d+\u0007)/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let Tmpl_Mathcer = /<%([@=!:~])?([\s\S]+?)%>|$/g;
let outputCmdReg = /<%([=!@:~])?([\s\S]*?)%>/g;
let ctrlCmdReg = /<%[^=!@:~][\s\S]*?%>\s*/g;
var phCmdReg = /&\u0008\d+&\u0008/g;
let continuedCmdReg = /(?:&\u0008\d+&\u0008){2,}/g;
let bwCmdReg = /%>\s*<%/g;
let blockCmdReg = /([\{\}]);/g;
let continuedSemicolonReg = /;+/g;
let phKey = '&\u0008';
let borderChars = /^\s*<%[\{\}\(\)\[\];\s]+%>\s*$/;

let BindReg2 = /(\s*)<%:([\s\S]+?)%>(\s*)/g;
let BindFunctionsReg = /\s*\{\s*([^\{\}]+)\}\s*$/;
let BindEventsReg = /^\s*\[([^\[\]]+)\]\s*/;

module.exports = {
    compile(tmpl) {
        if (!configs.disableMagixUpdater) {
            let tps = [];
            let index = 0;
            let htmlIndex = 0;
            let htmlStore = Object.create(null);

            //特殊处理绑定事件及参数
            tmpl = tmpl.replace(BindReg2, (m, left, expr, right) => {
                if (BindFunctionsReg.test(expr)) {
                    expr = expr.replace(BindFunctionsReg, ',"\u0017$1"');
                }
                if (BindEventsReg.test(expr)) {
                    expr = expr.replace(BindEventsReg, '"\u0017$1",');
                }
                return (left || '') + '<%:' + expr + '%>' + (right || '');
            });

            tmpl.replace(Tmpl_Mathcer, (match, operate, content, offset) => {
                let start = 2;
                if (operate) {
                    start = 3;
                }
                let source = tmpl.slice(index, offset + start);
                let key = '\u0005' + (htmlIndex++) + '\u0005';
                htmlStore[key] = source;
                index = offset + match.length - 2;
                tps.push(';"', key, '";', content);
                index = offset + match.length - 2;
            });

            tps = configs.compileTmplCommand(tps.join(''), configs);
            tps = tps.replace(/(?:\s*;\s*"\u0005|\u0005"\s*;\s*)/g, '\u0005');
            tps = tps.replace(/\u0005\d+\u0005/g, m => htmlStore[m]);
            tps = tps.replace(outputCmdReg, (m, o, c) => {
                //还原格式
                c = jm.min(c);
                return '<%' + (o || '') + c + '%>';
            });
            tmpl = tps;
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
            tmpl = tmpl.replace(ctrlCmdReg, (m, k) => {
                k = phKey + (idx++) + phKey; //占位符
                stores[k] = m; //存储
                return k;
            });
            //把多个连续的控制命令做压缩
            tmpl = tmpl.replace(continuedCmdReg, m => {
                m = m.replace(phCmdReg, n => stores[n]) //命令还原
                    .replace(bwCmdReg, ';')
                    .replace(blockCmdReg, '$1')
                    .replace(continuedSemicolonReg, ';'); //删除中间的%><%及分号
                return m;
            });
            tmpl = tmpl.replace(phCmdReg, n => stores[n]); //其它命令还原
            tmpl = tmpl.replace(bwCmdReg, '%><%');
            tmpl = tmpl.replace(Tmpl_Mathcer, m => {
                borderChars.lastIndex = 0;
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
            return tmpl.replace(configs.tmplCommand, (match, key) => {
                if (!dataset[match]) {
                    idx++;
                    key = anchor + idx + anchor;
                    dataset[match] = key;
                    dataset[key] = match;
                    dataset.___idx = idx;
                }
                return dataset[match];
            });
        }
        return tmpl;
    },
    tidy(tmpl) { //简单压缩
        tmpl = htmlminifier.minify(tmpl, configs.htmlminifierOptions);
        tmpl = tmpl.replace(tmplCommandAnchorCompressReg, '$1');
        tmpl = tmpl.replace(tmplCommandAnchorCompressReg2, '$1$2');
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