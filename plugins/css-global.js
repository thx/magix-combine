let configs = require('./util-config');
let checker = require('./css-checker');
let cssFileRead = require('./css-read');
let cssAtRule = require('./css-atrule');
let cssParser = require('./css-parser');
let {
    cssCommentReg,
    cssRefReg,
    genCssNamesKey,
    cssNameNewProcessor,
    cssNameGlobalProcessor,
    genCssSelector
} = require('./css-selector');
let globalCssNamesMap = {};
let globalCssNamesInFiles = {};
let globalCssTagsInFiles = {};
let scopedStyle = '';
let globalPromise;
let lazyGlobalInfo = {};
let processGlobal = (ctx) => {
    globalCssNamesMap = {};
    globalCssNamesInFiles = {};
    globalCssTagsInFiles = {};
    let globalGuid = Date.now();
    return new Promise((resolve, reject) => {
        let list = configs.globalCss;
        if (!list || !list.length) {
            resolve(ctx);
        } else {
            let add = (info) => {
                let cssNamesMap = {};
                let fileTags = {};
                if (info.exists && info.content) {
                    let currentFile = info.file;
                    let css = info.content.replace(cssCommentReg, '');
                    try {
                        cssNameGlobalProcessor(css, {
                            shortFile: currentFile.replace(configs.moduleIdRemovedPath, '').slice(1),
                            globalGuid: globalGuid,
                            namesMap: globalCssNamesMap,
                            namesToFiles: globalCssNamesInFiles,
                            cNamesMap: cssNamesMap,
                            addToGlobalCSS: true,
                            file: currentFile,
                            fileTags: fileTags,
                            tagsToFiles: globalCssTagsInFiles
                        });
                    } catch (e) {
                        reject(e);
                    }
                    checker.fileToTags(currentFile, fileTags, ctx.inwatch);
                    checker.fileToSelectors(currentFile, cssNamesMap, ctx.inwatch);
                }
            };
            let ps = [];
            for (let i = 0; i < list.length; i++) {
                ps.push(cssFileRead(list[i], '', ctx.context));
            }
            Promise.all(ps).then((rs) => {
                for (let i = 0; i < rs.length; i++) {
                    add(rs[i]);
                }
                for (let p in globalCssNamesInFiles) {
                    if (p.slice(-2, -1) == '!') continue;
                    let sameSelectors = globalCssNamesInFiles[p];
                    let values = Object.keys(sameSelectors);
                    if (values.length > 1) {
                        globalCssNamesInFiles[p + '!r'] = values;
                    }
                }
                resolve(ctx);
            }).catch(reject);
        }
    });
};
let processScope = (ctx) => {
    scopedStyle = '';
    //console.log('process scoped'.red);
    return new Promise((resolve, reject) => {
        let list = configs.scopedCss;
        if (!list || !list.length) {
            resolve(ctx);
        } else {
            let add = (i) => {
                let cssNamesMap = {};
                let cssTagsMap = {};
                if (i.exists && i.content) {
                    let currentFile = i.file;
                    let cssNamesKey = genCssNamesKey(currentFile);
                    let c = i.content.replace(cssCommentReg, '');
                    c = c.replace(cssRefReg, ctx.refProcessor);
                    try {
                        c = cssNameNewProcessor(c, {
                            shortFile: currentFile.replace(configs.moduleIdRemovedPath, '').slice(1),
                            namesMap: globalCssNamesMap,
                            namesToFiles: globalCssNamesInFiles,
                            namesKey: cssNamesKey,
                            cNamesMap: cssNamesMap,
                            cNamesToFiles: globalCssNamesInFiles,
                            addToGlobalCSS: true,
                            file: currentFile,
                            fileTags: cssTagsMap,
                            tagsToFiles: globalCssTagsInFiles
                        });
                    } catch (e) {
                        reject(e);
                    }
                    c = cssAtRule(c, cssNamesKey);
                    checker.fileToSelectors(currentFile, cssNamesMap, ctx.inwatch);
                    checker.fileToTags(currentFile, cssTagsMap, ctx.inwatch);
                    scopedStyle += c;
                } else if (!i.exists) {
                    checker.markUnexists(i.file, '/scoped.style');
                    scopedStyle += ' unfound-' + i.file;
                }
            };
            let ps = [];
            for (let i = 0; i < list.length; i++) {
                ps.push(cssFileRead(list[i], '', ctx.context));
            }
            Promise.all(ps).then((rs) => {
                for (let i = 0; i < rs.length; i++) {
                    add(rs[i]);
                }
                //if (!configs.compressCss) {
                let sToKeys = {};
                let namesToFiles = globalCssNamesInFiles;
                let namesMap = globalCssNamesMap;
                for (let p in namesToFiles) {
                    if (p.slice(-2, -1) == '!') continue;
                    let sameSelectors = namesToFiles[p + '!s'];
                    let values = Object.values(sameSelectors);
                    if (values.length > 1) {
                        namesToFiles[p + '!r'] = values;
                        let key = '';
                        if (configs.compressCss) {
                            key = genCssNamesKey(values[0]) + '-' + genCssSelector(p);
                        } else {
                            let keys = [],
                                k;
                            for (let i = 0; i < values.length; i++) {
                                k = genCssNamesKey(values[i], i);
                                keys.push(k);
                            }
                            key = keys.join('-and-') + '-' + genCssSelector(p);
                        }
                        namesMap[p] = key;
                        for (let z in sameSelectors) {
                            sToKeys[z] = namesMap[p];
                        }
                    }
                }
                let tokens = cssParser(scopedStyle).tokens;
                for (let i = tokens.length - 1; i >= 0; i--) {
                    let token = tokens[i];
                    let id = token.name;
                    if (token.type == 'class') {
                        if (sToKeys[id]) {
                            scopedStyle = scopedStyle.slice(0, token.start) + sToKeys[id] + scopedStyle.slice(token.end);
                        }
                    }
                }
                resolve(ctx);
            }).catch(reject);
        }
    });
};
module.exports = {
    process(info) {
        if (!globalPromise) {
            globalPromise = Promise.resolve(info);
            globalPromise = globalPromise.then(processGlobal).then(processScope).then(() => {
                for (let p in lazyGlobalInfo) {
                    let info = lazyGlobalInfo[p];
                    if (info) {
                        Object.assign(globalCssNamesMap, info.a);
                        Object.assign(globalCssNamesInFiles, info.b);
                    }
                }
                return {
                    globalCssNamesMap,
                    globalCssNamesInFiles,
                    globalCssTagsInFiles,
                    scopedStyle
                };
            });
        }
        return globalPromise;
    },
    add(file, cssNamesMap, cssNamesInFiles) {
        lazyGlobalInfo[file] = {
            a: globalCssNamesMap,
            b: cssNamesInFiles
        };
        Object.assign(globalCssNamesMap, cssNamesMap);
        Object.assign(globalCssNamesInFiles, cssNamesInFiles);
    },
    reset(file) {
        globalPromise = null;
        let info = lazyGlobalInfo[file];
        if (file && info) {
            info.a = null;
            info.b = null;
        }
    }
};