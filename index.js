var fs = require('fs');
var path = require('path');

var configs = require('./plugins/util-config');
var fd = require('./plugins/util-fd');
var initFolder = require('./plugins/util-init');
var js = require('./plugins/js');
var jsContent = require('./plugins/js-content');
var deps = require('./plugins/util-deps');


module.exports = {
    walk: fd.walk,
    copyFile: fd.copy,
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
    },
    combine: function() {
        return new Promise(function(resolve) {
            initFolder();
            var ps = [];
            fd.walk(configs.tmplFolder, function(filepath) {
                var from = filepath;
                var to = from.replace(configs.tmplReg, configs.srcHolder);
                ps.push(js.process(from, to));
            });
            Promise.all(ps).then(resolve);
        });
    },
    processFile: function(from) {
        initFolder();
        var to = from.replace(configs.tmplReg, configs.srcHolder);
        return js.process(from, to, true);
    },
    processContent: function(from, to, content) {
        initFolder();
        return jsContent.process(from, to, content);
    }
};