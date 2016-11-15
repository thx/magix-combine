var configs = require('./util-config');
var htmlminifier = require('html-minifier');
//模板文件，模板引擎命令处理，因为我们用的是字符串模板，常见的模板命令如<%=output%> {{output}}，这种通常会影响我们的分析，我们先把它们做替换处理
var anchor = '\u001e';
var tmplCommandAnchorCompressReg = /(\u001e\d+\u001e)\s+(?=[<>])/g;
var tmplCommandAnchorCompressReg2 = /([<>])\s+(\u001e\d+\u001e)/g;
var tmplCommandAnchorReg = /\u001e\d+\u001e/g;
module.exports = {
    compress: function(content) { //对模板引擎命令的压缩，如<%if(){%><%}else{%><%}%>这种完全可以压缩成<%if(){}else{}%>，因为项目中模板引擎不固定，所以这个需要外部实现
        return configs.compressTmplCommand(content);
    },
    store: function(tmpl, store) { //保存模板引擎命令
        var idx = 0;
        if (configs.tmplCommand) {
            return tmpl.replace(configs.tmplCommand, function(match, key) {
                if (!store[match]) {
                    key = anchor + idx + anchor;
                    store[match] = key;
                    store[key] = match;
                    idx++;
                }
                return store[match];
            });
        }
        return tmpl;
    },
    tidy: function(tmpl) { //简单压缩
        tmpl = htmlminifier.minify(tmpl, configs.htmlminifierOptions);
        tmpl = tmpl.replace(tmplCommandAnchorCompressReg, '$1');
        tmpl = tmpl.replace(tmplCommandAnchorCompressReg2, '$1$2');
        return tmpl;
    },
    recover: function(tmpl, refTmplCommands) { //恢复替换的命令
        return tmpl.replace(tmplCommandAnchorReg, function(match) {
            var value = refTmplCommands[match];
            return value;
        });
    }
};