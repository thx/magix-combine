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
let chalk = require('chalk');
let util = require('util');

if (!Object.values) {
    Object.values = object => {
        let result = [];
        if (object) {
            for (let p in object) {
                if (object.hasOwnProperty(p)) {
                    result.push(object[p]);
                }
            }
        }
        return result;
    };
}

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
    return sc + '/' + st + ' ' + chalk.blue(barLeft) + chalk.grey(barRight) + ' ' + (percent * 100).toFixed(2) + '%';
};
module.exports = {
    walk: fd.walk,
    readFile: fd.read,
    copyFile: fd.copy,
    writeFile: fd.write,
    removeFile(from) {
        initEnv();
        from = path.resolve(from);
        deps.removeFileDepend(from);
        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
        if (fs.existsSync(to)) {
            fs.unlinkSync(to);
        }
    },
    removeCache(from) {
        from = path.resolve(from);
        checker.CSS.reset();
        jsFileCache.clear(from);
        cssGlobal.reset(from);
    },
    config(cfg) {
        for (let p in cfg) {
            if (p !== 'checker' &&
                p != 'tmplConstVars' &&
                p != 'tmplUnchangableVars' &&
                p != 'tmplGlobalVars' &&
                p != 'galleries' &&
                p != 'cssSelectorPrefix') {
                configs[p] = cfg[p];
            }
        }
        if (cfg) {
            if (cfg.hasOwnProperty('checker')) {
                if (cfg.checker) {
                    if (util.isObject(cfg.checker)) {
                        configs.checker = Object.assign(configs.checker, cfg.checker);
                    }
                } else {
                    configs.checker = {};
                }
            }
        }
        let scopedCssMap = Object.create(null);
        let globalCssMap = Object.create(null);

        configs.globalCss = configs.globalCss.map(p => {
            p = path.resolve(p);
            globalCssMap[p] = 1;
            return p;
        });
        configs.scopedCss = configs.scopedCss.map(p => {
            p = path.resolve(p);
            scopedCssMap[p] = 1;
            return p;
        });
        configs.scopedCssMap = scopedCssMap;
        configs.globalCssMap = globalCssMap;
        configs.uncheckGlobalCss = configs.uncheckGlobalCss.map(p => path.resolve(p));
        let specials = [{
            src: 'tmplConstVars'
        }, {
            src: 'tmplUnchangableVars',
            to: 'tmplConstVars'
        }, {
            src: 'tmplGlobalVars'
        }, {
            src: 'galleries'
        }, {
            src: 'cssSelectorPrefix',
            to: 'projectName'
        }];
        let merge = (aim, src) => {
            if (util.isObject(src)) {
                if (!aim) aim = {};
                for (let p in src) {
                    aim[p] = merge(aim[p], src[p]);
                }
                return aim;
            } else {
                return src;
            }
        };
        if (cfg) {
            for (let s of specials) {
                if (cfg[s.src] !== undefined) {
                    if (Array.isArray(cfg[s.src])) {
                        for (let v of cfg[s.src]) {
                            configs[s.to || s.src][v] = 1;
                        }
                    } else {
                        configs[s.to || s.src] = merge(configs[s.to || s.src], cfg[s.src]);
                    }
                }
            }
        }
        return configs;
    },
    combine() {
        slog.hook();
        return new Promise((resolve, reject) => {
            initEnv();
            setTimeout(() => {
                let ps = [];
                let total = 0;
                let completed = 0;
                let tasks = [];
                fd.walk(configs.commonFolder, filepath => {
                    if (configs.jsFileExtNamesReg.test(filepath)) {
                        let from = path.resolve(filepath);
                        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
                        total++;
                        tasks.push({
                            from,
                            to
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
                    let tks = tasks.slice(current, current += configs.concurrentTask);
                    if (tks.length) {
                        ps = [];
                        tks.forEach(it => {
                            ps.push(js.process(it.from, it.to).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        });
                        Promise.all(ps).then(run).catch(ex => {
                            errorOccured = true;
                            slog.clear(true);
                            reject(ex);
                        });
                    } else {
                        setTimeout(() => {
                            checker.output();
                            slog.clear(true);
                            slog.unhook();
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
        this.removeCache(from);
        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
        return js.process(from, to, true).then(() => {
            checker.output();
            return Promise.resolve();
        });
    },
    processContent(from, to, content) {
        initEnv();
        from = path.resolve(from);
        this.removeCache(from);
        return jsContent.process(from, to, content, false, false);
    },
    processTmpl() {
        slog.hook();
        return new Promise((resolve, reject) => {
            initEnv();
            let ps = [];
            let total = 0;
            let completed = 0;
            let tasks = [];
            fd.walk(configs.commonFolder, filepath => {
                //if (filepath.indexOf('/nav') >= 0) {
                let from = path.resolve(filepath);
                total++;
                tasks.push(from);
                //}
            });
            let errorOccured = false;
            let current = 0;
            let run = () => {
                errorOccured = false;
                let tks = tasks.slice(current, current += configs.concurrentTask);
                if (tks.length) {
                    ps = [];
                    tks.forEach(from => {
                        if (configs.tmplFileExtNamesReg.test(from)) {
                            ps.push(tmplNaked.process(from).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        }
                    });
                    Promise.all(ps).then(run).catch(ex => {
                        errorOccured = true;
                        slog.clear(true);
                        reject(ex);
                    });
                } else {
                    setTimeout(() => {
                        slog.clear(true);
                        slog.unhook();
                        resolve();
                    }, 100);
                }
            };
            run();
        });
    },
    getFileDependents(file) {
        return deps.getDependents(file);
    }
};