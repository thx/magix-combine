var fd = require('./util-fd');
var jsMx = require('./js-mx');
var jsRequire = require('./js-require');
var cssProcessor = require('./css');
var tmplProcessor = require('./tmpl');
var atpath = require('./util-atpath');
var jsLoader = require('./js-loader');
var configs = require('./util-config');

var mxTailReg = /\.mx$/;
//文件内容处理，主要是把各个处理模块串起来
var moduleIdReg = /(['"])(@moduleId)\1/g;
module.exports = {
    process: function(from, to, content) {
        if (!content) content = fd.read(from);
        for (var i = configs.excludeTmplFolders.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFolders[i]) >= 0) {
                return Promise.resolve(content);
            }
        }
        var r = configs.excludeFileContent(content);
        if (r === true) {
            return Promise.resolve(content);
        }
        var contentInfo;
        if (mxTailReg.test(from)) {
            contentInfo = jsMx.process(content, from);
            content = contentInfo.script;
        }
        return jsRequire.process({
            from: from,
            content: content
        }).then(function(e) {
            e.to = to;
            if (contentInfo) e.contentInfo = contentInfo;
            return cssProcessor(e);
        }).then(tmplProcessor).then(function(e) {
            //e.content = Processor.run('comment', 'restore', [e.content, store]);
            e.content = e.content.replace(moduleIdReg, '$1' + e.moduleId + '$1');
            e.content = atpath.resolvePath(e.content, e.moduleId);
            var tmpl = jsLoader(e);
            return Promise.resolve(tmpl);
        }).catch(function(e) {
            console.log(e);
        });
    }
};