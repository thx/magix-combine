let fs = require('fs');
let path = require('path');
let configs = require('./plugins/util-config');
let fd = require('./plugins/util-fd');
let initFolder = require('./plugins/util-init');
let js = require('./plugins/js');
let jsContent = require('./plugins/js-content');
let deps = require('./plugins/util-deps');
let cssChecker = require('./plugins/css-checker');
require('colors');

module.exports = {
    walk: fd.walk,
    copyFile: fd.copy,
    writeFile: fd.write,
    removeFile(from) {
        deps.removeFileDepend(from);
        let file = from.replace(configs.tmplReg, configs.srcHolder);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    },
    config(cfg) {
        for (let p in cfg) {
            configs[p] = cfg[p];
        }
        configs.excludeTmplFolders = configs.excludeTmplFolders.map((p) => path.resolve(p));
        configs.excludeTmplFiles = configs.excludeTmplFiles.map((p) => path.resolve(p));
        configs.globalCss = configs.globalCss.map((p) => path.resolve(p));
        configs.scopedCss = configs.scopedCss.map((p) => path.resolve(p));
        configs.excludeTmplFiles = configs.excludeTmplFolders.concat(configs.excludeTmplFiles);
    },
    combine() {
        return new Promise((resolve, reject) => {
            initFolder();
            let ps = [];
            fd.walk(configs.tmplFolder, (filepath) => {
                let from = path.resolve(filepath);
                let to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
                ps.push(js.process(from, to));
            });
            Promise.all(ps).then(() => {
                cssChecker.output();
                return Promise.resolve();
            }).then(resolve, reject);
        });
    },
    processFile(from) {
        initFolder();
        from = path.resolve(from);
        cssChecker.reset();
        let to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
        return js.process(from, to, true).then(() => {
            cssChecker.output();
            return Promise.resolve();
        });
    },
    processContent(from, to, content, outputObject) {
        initFolder();
        return jsContent.process(from, to, content, outputObject);
    }
};