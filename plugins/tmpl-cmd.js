let configs = require('./util-config');
let htmlminifier = require('html-minifier');
//模板文件，模板引擎命令处理，因为我们用的是字符串模板，常见的模板命令如<%=output%> {{output}}，这种通常会影响我们的分析，我们先把它们做替换处理
let anchor = '\u0007';
let tmplCommandAnchorCompressReg = /(\u0007\d+\u0007)\s+(?=[<>])/g;
let tmplCommandAnchorCompressReg2 = /([<>])\s+(\u0007\d+\u0007)/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
module.exports = {
    compress(content) { //对模板引擎命令的压缩，如<%if(){%><%}else{%><%}%>这种完全可以压缩成<%if(){}else{}%>，因为项目中模板引擎不固定，所以这个需要外部实现
        return configs.compressTmplCommand(content);
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
        return tmpl.replace(tmplCommandAnchorReg, (match) => {
            let value = refTmplCommands[match];
            if (processor) {
                value = processor(value);
            }
            return value;
        });
    }
};