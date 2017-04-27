let configs = require('./util-config');
let slog = require('./util-log');
let filesToSelectors = {};
let filesUndeclared = {};
let markUsedTemp = {};
let existsSelectors = [];
let fileSelectorsUsed = {};
let fileGlobals = {};
module.exports = {
    reset(all) {
        filesUndeclared = {};
        filesToSelectors = {};
        fileGlobals = {};
        if (all) {
            existsSelectors = [];
            fileSelectorsUsed = {};
            markUsedTemp = {};
        }
    },
    clearUsed(from) {
        if (!configs.logCssChecker) return;
        for (let p in fileSelectorsUsed) {
            let fInfo = fileSelectorsUsed[p];
            if (fInfo) {
                for (let z in fInfo) {
                    let sInfo = fInfo[z];
                    delete sInfo[from];
                }
            }
        }
    },
    fileToSelectors(file, selectors, processUsed) {
        if (!configs.logCssChecker) return;
        if (!filesToSelectors[file]) {
            filesToSelectors[file] = Object.assign({}, selectors);
            //slog.ever('@@@@@@@@',file,selectors)
            let a = markUsedTemp[file];
            if (a && a.length) {
                delete markUsedTemp[file];
                this.markUsed(file, a);
            }
            if (processUsed) {
                let fInfo = fileSelectorsUsed[file];
                if (fInfo) {
                    for (let s in fInfo) {
                        let sInfo = fInfo[s];
                        let keys = Object.keys(sInfo);
                        if (keys.length) {
                            this.markUsed(file, s);
                        }
                    }
                }
            }
        }
    },
    markExists(name, currentFile, prevFiles) {
        if (!configs.logCssChecker) return;
        let key = [name, currentFile, prevFiles].join('\u0000');
        if (!existsSelectors[key]) {
            existsSelectors[key] = true;
            existsSelectors.push({
                name: name,
                current: currentFile,
                prev: prevFiles
            });
        }
    },
    markUsed(files, selectors, host) {
        if (!configs.logCssChecker) return;
        if (!Array.isArray(files)) {
            files = [files];
        }
        if (!Array.isArray(selectors)) {
            selectors = [selectors];
        }
        files.forEach((file) => {
            let info = filesToSelectors[file];
            if (info) {
                selectors.forEach((selector) => {
                    // if(selector=='store-query-footer'){
                    //     console.log(host,info);
                    // }
                    if (host) {
                        let fInfo = fileSelectorsUsed[file];
                        if (!fInfo) {
                            fInfo = fileSelectorsUsed[file] = {};
                        }
                        let sInfo = fInfo[selector];
                        if (!sInfo) {
                            sInfo = fInfo[selector] = {};
                        }
                        sInfo[host] = 1;
                    }
                    delete info[selector];
                });
            } else {
                let a = markUsedTemp[file];
                if (!a) a = markUsedTemp[file] = [];
                a.push.apply(a, selectors);
            }
        });
    },
    markLazyDeclared(selector) {
        if (!configs.logCssChecker) return;
        for (let p in filesUndeclared) {
            let info = filesUndeclared[p];
            delete info[selector];
        }
    },
    markUndeclared(file, selector) {
        if (!configs.logCssChecker) return;
        let r = filesUndeclared[file];
        if (!r) {
            r = filesUndeclared[file] = {};
        }
        r[selector] = 1;
    },
    markGlobal(file, name) {
        let info = fileGlobals[file];
        if (!info) {
            info = fileGlobals[file] = {};
        }
        info[name] = 1;
    },
    output() {
        let p, keys, outCss = false;
        if (configs.logCssChecker) {
            for (let p in fileGlobals) {
                outCss = true;
                let info = fileGlobals[p];
                let keys = Object.keys(info);
                slog.ever(p.magenta + ' avoid use ' + (keys + '').red);
            }
        }
        if (configs.logCssChecker) {
            if (outCss) {
                slog.ever('──────────────────────────────'.gray);
            }
            outCss = false;
            if (existsSelectors.length) {
                outCss = true;
                existsSelectors.forEach((item) => {
                    slog.ever('css:already exists', item.name.red, 'current file', item.current.grey, 'prev files', item.prev.blue);
                });
                existsSelectors = [];
            }
        }
        if (configs.logCssChecker) {
            if (outCss) {
                slog.ever('──────────────────────────────'.gray);
            }
            outCss = false;
            for (p in filesToSelectors) {
                keys = Object.keys(filesToSelectors[p]);
                if (keys.length) {
                    outCss = true;
                    slog.ever(p.magenta + ' never used', ('.' + keys.join(' .')).red);
                }
            }
        }
        if (configs.logCssChecker) {
            if (outCss) {
                slog.ever('──────────────────────────────'.gray);
            }
            for (p in filesUndeclared) {
                keys = Object.keys(filesUndeclared[p]);
                if (keys.length) {
                    slog.ever(p.magenta + ' never declared', ('.' + keys.join(' .')).red);
                }
            }
        }
    }
};