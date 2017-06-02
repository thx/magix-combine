let fs = require('fs');
let path = require('path');
let configs = require('./plugins/util-config');
let fd = require('./plugins/util-fd');
let initEnv = require('./plugins/util-init');
let js = require('./plugins/js');
let jsContent = require('./plugins/js-content');
let deps = require('./plugins/util-deps');
let checker = require('./plugins/checker');
let cssGlobal = require('./plugins/css-global');
let jsFileCache = require('./plugins/js-fcache');
let tmplNaked = require('./plugins/tmpl-naked');
let slog = require('./plugins/util-log');
require('colors');
// let loading='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
let genMsg = (completed, total) => {
    let len = 40;
    if (completed > total) completed = total;
    let percent = completed / total;
    let cell = Math.round(percent * len);
    let barLeft = '';
    for (let i = 0; i < cell; i++) {
        barLeft += '━';
    }
    let barRight = '';
    for (let i = cell; i < len; i++) {
        barRight += '━';
    }
    let sc = completed + '';
    let st = total + '';
    let diff = st.length - sc.length;
    while (diff) {
        sc = ' ' + sc;
        diff--;
    }
    return sc + '/' + st + ' ' + barLeft.blue + barRight.grey + ' ' + (percent * 100).toFixed(2) + '%';
};
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
        configs.globalCss = configs.globalCss.map(p => path.resolve(p));
        configs.scopedCss = configs.scopedCss.map(p => path.resolve(p));
        configs.uncheckGlobalCss = configs.uncheckGlobalCss.map(p => path.resolve(p));
        configs.resetCss = configs.globalCss.concat(configs.scopedCss);
    },
    combine() {
        return new Promise((resolve, reject) => {
            initEnv();
            setTimeout(() => {
                let ps = [];
                let total = 0;
                let completed = 0;
                let tasks = [];
                let once = 3;
                fd.walk(configs.tmplFolder, (filepath) => {
                    if (configs.compileFileExtNamesReg.test(filepath)) {
                        let from = path.resolve(filepath);
                        let to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
                        total++;
                        tasks.push({
                            from: from,
                            to: to
                        });
                    }
                });
                if (configs.log) {
                    slog.log(genMsg(++completed, total));
                }
                let errorOccured = false;
                let current = 0;
                let run = () => {
                    errorOccured = false;
                    let tks = tasks.slice(current, current += once);
                    if (tks.length) {
                        ps = [];
                        tks.forEach((it) => {
                            ps.push(js.process(it.from, it.to).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        });
                        Promise.all(ps).then(run).catch((ex) => {
                            errorOccured = true;
                            slog.clear(true);
                            reject(ex);
                        });
                    } else {
                        setTimeout(() => {
                            checker.output();
                            slog.clear(true);
                            resolve();
                        }, 100);
                    }
                };
                run();
            }, 0);
        });
    },
    processFile(from) {
        initEnv();
        from = path.resolve(from);
        checker.CSS.reset();
        jsFileCache.clear(from);
        cssGlobal.reset(from);
        let to = path.resolve(configs.srcFolder + from.replace(configs.moduleIdRemovedPath, ''));
        return js.process(from, to, true).then(() => {
            checker.output();
            return Promise.resolve();
        });
    },
    processContent(from, to, content) {
        initEnv();
        jsFileCache.clear(from);
        return jsContent.process(from, to, content, false, false);
    },
    processTmpl() {
        return new Promise((resolve, reject) => {
            initEnv();
            let ps = [];
            let total = 0;
            let completed = 0;
            let tasks = [];
            let once = 3;
            fd.walk(configs.tmplFolder, (filepath) => {
                let from = path.resolve(filepath);
                total++;
                tasks.push(from);
            });
            let errorOccured = false;
            let current = 0;
            let run = () => {
                errorOccured = false;
                let tks = tasks.slice(current, current += once);
                if (tks.length) {
                    ps = [];
                    tks.forEach((from) => {
                        if (configs.tmplFileExtNamesReg.test(from)) {
                            ps.push(tmplNaked.process(from).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        }
                    });
                    Promise.all(ps).then(run).catch((ex) => {
                        errorOccured = true;
                        slog.clear(true);
                        reject(ex);
                    });
                } else {
                    setTimeout(() => {
                        slog.clear(true);
                        resolve();
                    }, 100);
                }
            };
            run();
        });
    },
    stripCmd(tmpl) {
        initEnv();
        if (configs.tmplCommand) {
            return tmpl.replace(configs.tmplCommand, () => {
                return '';
            });
        }
        return tmpl;
    }
};