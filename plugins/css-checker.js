let configs = require('./util-config');
let filesToSelectors = {};
let filesUndeclared = {};
let markUsedTemp = {};
let existsSelectors = [];
let fileSelectorsUsed = {};
let fileGlobals = {};
module.exports = {
    reset() {
        filesUndeclared = {};
        filesToSelectors = {};
        fileGlobals = {};
    },
    clearUsed(from) {
        if (!configs.logCssUnused) return;
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
        if (!configs.logCssUnused) return;
        if (!filesToSelectors[file]) {
            filesToSelectors[file] = Object.assign({}, selectors);
            //console.log('@@@@@@@@',file,selectors)
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
        if (!configs.logCssExists) return;
        existsSelectors.push({
            name: name,
            current: currentFile,
            prev: prevFiles
        });
    },
    markUsed(files, selectors, host) {
        if (!configs.logCssUnused) return;
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
        if (!configs.logTmplClassUndeclared) return;
        for (let p in filesUndeclared) {
            let info = filesUndeclared[p];
            delete info[selector];
        }
    },
    markUndeclared(file, selector) {
        if (!configs.logTmplClassUndeclared) return;
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
        if (configs.logFileCssGlobal) {
            for (let p in fileGlobals) {
                outCss = true;
                let info = fileGlobals[p];
                let keys = Object.keys(info);
                console.log(p.magenta + ' avoid use ' + (keys + '').red);
            }
        }
        if (configs.logCssExists) {
            if (outCss) {
                console.log('------------------------------'.gray);
            }
            outCss = false;
            if (existsSelectors.length) {
                outCss = true;
                existsSelectors.forEach((item) => {
                    console.log('css:already exists', item.name.red, 'current file', item.current.grey, 'prev files', item.prev.blue);
                });
                existsSelectors = [];
            }
        }
        if (configs.logCssUnused) {
            if (outCss) {
                console.log('------------------------------'.gray);
            }
            outCss = false;
            for (p in filesToSelectors) {
                keys = Object.keys(filesToSelectors[p]);
                if (keys.length) {
                    outCss = true;
                    console.log(p.magenta + ' never used', ('.' + keys.join(' .')).red);
                }
            }
        }
        if (configs.logTmplClassUndeclared) {
            if (outCss) {
                console.log('------------------------------'.gray);
            }
            for (p in filesUndeclared) {
                keys = Object.keys(filesUndeclared[p]);
                if (keys.length) {
                    console.log(p.magenta + ' never declared', ('.' + keys.join(' .')).red);
                }
            }
        }
    }
};