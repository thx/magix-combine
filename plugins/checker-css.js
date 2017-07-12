let configs = require('./util-config');
let slog = require('./util-log');
let filesToSelectors = Object.create(null);
let filesUndeclared = Object.create(null);
let markUsedTemp = Object.create(null);
let existsSelectors = [];
let fileSelectorsUsed = Object.create(null);
let fileGlobals = Object.create(null);
let filesToTags = Object.create(null);
let markUsedTempTags = Object.create(null);
let fileTagsUsed = Object.create(null);
let unexists = Object.create(null);
module.exports = {
    reset(all) {
        filesUndeclared = Object.create(null);
        filesToSelectors = Object.create(null);
        fileGlobals = Object.create(null);
        filesToTags = Object.create(null);
        unexists = Object.create(null);
        if (all) {
            existsSelectors = [];
            fileSelectorsUsed = Object.create(null);
            markUsedTemp = Object.create(null);
        }
    },
    clearUsed(from) {
        if (!(configs.check || configs.checkCss)) return;
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
    clearUsedTags(from) {
        if (!(configs.check || configs.checkCss)) return;
        for (let p in fileTagsUsed) {
            let fInfo = fileTagsUsed[p];
            if (fInfo) {
                for (let z in fInfo) {
                    let sInfo = fInfo[z];
                    delete sInfo[from];
                }
            }
        }
    },
    fileToTags(file, tags, processUsed) {
        if (!(configs.check || configs.checkCss)) return;
        if (!filesToTags[file]) {
            filesToTags[file] = Object.assign(Object.create(null), tags);
            let a = markUsedTempTags[file];
            if (a && a.length) {
                delete markUsedTempTags[file];
                this.markUsedTags(file, a);
            }
            if (processUsed) {
                let fInfo = fileTagsUsed[file];
                if (fInfo) {
                    for (let s in fInfo) {
                        let sInfo = fInfo[s];
                        let keys = Object.keys(sInfo);
                        if (keys.length) {
                            this.markUsedTags(file, s);
                        }
                    }
                }
            }
        }
    },
    fileToSelectors(file, selectors, processUsed) {
        if (!(configs.check || configs.checkCss)) return;
        if (!filesToSelectors[file]) {
            filesToSelectors[file] = Object.assign(Object.create(null), selectors);
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
        if (!(configs.check || configs.checkCss)) return;
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
    markUnexists(name, currentFile) {
        if (!(configs.check || configs.checkCss)) return;
        if (!unexists[currentFile]) {
            unexists[currentFile] = Object.create(null);
        }
        unexists[currentFile][name] = name;
    },
    markUsed(files, selectors, host) {
        if (!(configs.check || configs.checkCss)) return;
        if (!Array.isArray(files)) {
            files = [files];
        }
        if (!Array.isArray(selectors)) {
            selectors = [selectors];
        }
        files.forEach(file => {
            let info = filesToSelectors[file];
            if (info) {
                selectors.forEach(selector => {
                    if (host) {
                        let fInfo = fileSelectorsUsed[file];
                        if (!fInfo) {
                            fInfo = fileSelectorsUsed[file] = Object.create(null);
                        }
                        let sInfo = fInfo[selector];
                        if (!sInfo) {
                            sInfo = fInfo[selector] = Object.create(null);
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
    markUsedTags(files, tags, host) {
        if (!(configs.check || configs.checkCss)) return;
        if (!Array.isArray(files)) {
            files = [files];
        }
        if (!Array.isArray(tags)) {
            tags = [tags];
        }
        //console.log(tags,filesToTags,files,'@@@@@@@@@@');
        files.forEach(file => {
            let info = filesToTags[file];
            if (info) {
                tags.forEach(tag => {
                    if (host) {
                        let fInfo = fileTagsUsed[file];
                        if (!fInfo) {
                            fInfo = fileTagsUsed[file] = Object.create(null);
                        }
                        let sInfo = fInfo[tag];
                        if (!sInfo) {
                            sInfo = fInfo[tag] = Object.create(null);
                        }
                        sInfo[host] = 1;
                    }
                    delete info[tag];
                });
            } else {
                let a = markUsedTempTags[file];
                if (!a) a = markUsedTempTags[file] = [];
                a.push.apply(a, tags);
            }
        });
    },
    markLazyDeclared(selector) {
        if (!(configs.check || configs.checkCss)) return;
        for (let p in filesUndeclared) {
            let info = filesUndeclared[p];
            delete info[selector];
        }
    },
    markUndeclared(file, selector) {
        if (!(configs.check || configs.checkCss)) return;
        let r = filesUndeclared[file];
        if (!r) {
            r = filesUndeclared[file] = Object.create(null);
        }
        r[selector] = 1;
    },
    markGlobal(file, name) {
        //name = name.replace(rnReg, '');
        let info = fileGlobals[file];
        if (!info) {
            info = fileGlobals[file] = Object.create(null);
        }
        info[name] = 1;
    },
    output() {
        let p, keys, outCss = false;
        if (configs.check && configs.checkCss) {
            for (let p in fileGlobals) {
                outCss = true;
                let info = fileGlobals[p];
                let keys = Object.keys(info);
                let short = p.replace(configs.moduleIdRemovedPath, '').slice(1);
                slog.ever(short.gray + ' avoid use ' + (keys + '').red);
            }
            if (outCss) {
                slog.ever('──────────────────────────────'.gray);
            }
            outCss = false;
            if (existsSelectors.length) {
                outCss = true;
                existsSelectors.forEach(item => {
                    let cShort = item.current.replace(configs.moduleIdRemovedPath, '').slice(1);
                    let pShort = item.prev.replace(configs.moduleIdRemovedPath, '').slice(1);
                    slog.ever('css:already exists', item.name.red, 'file', cShort.grey, 'prev files', pShort.blue);
                });
                existsSelectors = [];
            }
            if (outCss) {
                slog.ever('──────────────────────────────'.gray);
            }
            outCss = false;
            for (p in unexists) {
                keys = Object.keys(unexists[p]);
                if (keys.length) {
                    outCss = true;
                    let short = p.replace(configs.moduleIdRemovedPath, '').slice(1);
                    keys = keys.map(key => {
                        return key.replace(configs.moduleIdRemovedPath, '').slice(1);
                    });
                    slog.ever(short.gray + ' can not find', keys.reverse().join(',').red);
                }
            }
            outCss = false;
            let composeTagsAndSelectors = Object.create(null);
            for (p in filesToTags) {
                keys = Object.keys(filesToTags[p]);
                if (keys.length) {
                    outCss = true;
                    let short = p.replace(configs.moduleIdRemovedPath, '').slice(1);
                    composeTagsAndSelectors[short] = '"' + keys.reverse().join('","') + '"';
                }
            }
            for (p in filesToSelectors) {
                keys = Object.keys(filesToSelectors[p]);
                if (keys.length) {
                    outCss = true;
                    let short = p.replace(configs.moduleIdRemovedPath, '').slice(1);
                    if (composeTagsAndSelectors[short]) {
                        composeTagsAndSelectors[short] += ',".' + keys.reverse().join('",".') + '"';
                    } else {
                        composeTagsAndSelectors[short] = '".' + keys.reverse().join('",".') + '"';
                    }
                }
            }

            if (outCss) {
                for (p in composeTagsAndSelectors) {
                    keys = composeTagsAndSelectors[p];
                    slog.ever(p.gray + ' never used', keys.red);
                }
                slog.ever('──────────────────────────────'.gray);
            }
            for (p in filesUndeclared) {
                keys = Object.keys(filesUndeclared[p]);
                if (keys.length) {
                    let short = p.replace(configs.moduleIdRemovedPath, '').slice(1);
                    slog.ever(short.gray + ' never declared', ('.' + keys.join(' .')).red);
                }
            }
        }
    }
};