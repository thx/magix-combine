var fs = require('fs');
var path = require('path');
var configs = require('./plugins/util-config');
var fd = require('./plugins/util-fd');
var initFolder = require('./plugins/util-init');
var js = require('./plugins/js');
var jsContent = require('./plugins/js-content');
var deps = require('./plugins/util-deps');
require('colors');

module.exports = {
    walk: fd.walk,
    copyFile: fd.copy,
    writeFile: fd.write,
    removeFile: function(from) {
        deps.removeFileDepend(from);
        var file = from.replace(configs.tmplReg, configs.srcHolder);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    },
    config: function(config) {
        for (var p in config) {
            configs[p] = config[p];
        }
        configs.excludeTmplFolders = configs.excludeTmplFolders.map(function(str) {
            return path.resolve(str);
        });
        configs.excludeTmplFiles = configs.excludeTmplFiles.map(function(str) {
            return path.resolve(str);
        });
        configs.globalCss = configs.globalCss.map(function(str) {
            return path.resolve(str);
        });
        configs.scopedAsGlobalCss = configs.scopedAsGlobalCss.map(function(str) {
            return path.resolve(str);
        });
        configs.excludeTmplFiles = configs.excludeTmplFolders.concat(configs.excludeTmplFiles);
    },
    combine: function() {
        return new Promise(function(resolve, reject) {
            initFolder();
            var ps = [];
            fd.walk(configs.tmplFolder, function(filepath) {
                var from = path.resolve(filepath);
                var to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
                ps.push(js.process(from, to));
            });
            Promise.all(ps).then(resolve, reject);
        });
    },
    processFile: function(from) {
        initFolder();
        from = path.resolve(from);
        var to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
        return js.process(from, to, true);
    },
    processContent: function(from, to, content, outputObject) {
        initFolder();
        return jsContent.process(from, to, content, outputObject);
    }
};