let configs = require('./util-config');
let checker = require('./css-checker');
let cssFileRead = require('./css-read');
let cssAtRule = require('./css-atrule');
let {
    cssCommentReg,
    cssNameReg,
    cssRefReg,
    addGlobal,
    genCssNamesKey,
    cssNameProcessor,
    genCssSelector
} = require('./css-selector');
let globalCssNamesMap = {};
let globalCssNamesInFiles = {};
let scopedStyle = '';
let globalPromise;
let lazyGlobalInfo = {};
let processGlobal = (ctx) => {
    globalCssNamesMap = {};
    globalCssNamesInFiles = {};
    let globalGuid = Date.now();
    return new Promise((resolve, reject) => {
        let list = configs.globalCss;
        if (!list || !list.length) {
            resolve(ctx);
        } else {
            let cssNamesMap = {};
            let currentFile = '';
            let namesToFiles = {};
            let namesMap = {};
            let addToGlobal = (m, name) => {
                cssNamesMap[name] = name;
                addGlobal(name, name, globalGuid, false, currentFile, namesMap, namesToFiles);
            };
            let add = (info) => {
                cssNamesMap = {};
                if (info.exists && info.content) {
                    currentFile = info.file;
                    info.content.replace(cssCommentReg, '').replace(cssNameReg, addToGlobal);
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
                for (let p in namesToFiles) {
                    if (p.slice(-2, -1) == '!') continue;
                    let sameSelectors = namesToFiles[p];
                    let values = Object.keys(sameSelectors);
                    if (values.length > 1) {
                        namesToFiles[p + '!r'] = values;
                    }
                }
                globalCssNamesMap = namesMap;
                globalCssNamesInFiles = namesToFiles;
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
                let currentFile = '';
                let cssNamesKey = '';
                if (i.exists && i.content) {
                    currentFile = i.file;
                    cssNamesKey = genCssNamesKey(currentFile);
                    let c = i.content.replace(cssCommentReg, '');
                    c = c.replace(cssRefReg, ctx.refProcessor);
                    c = c.replace(cssNameReg, (m, name, attr) => {
                        return cssNameProcessor(m, name, attr, {
                            namesMap: globalCssNamesMap,
                            namesToFiles: globalCssNamesInFiles,
                            namesKey: cssNamesKey,
                            cNamesMap: cssNamesMap,
                            cNamesToFiles: globalCssNamesInFiles,
                            addToGlobalCSS: true,
                            file: currentFile
                        });
                    });
                    c = cssAtRule(c, genCssNamesKey(i.file)); //但处理at规则的时候，不同的文件，里面如果有相同的at规则不是能合并处理的，需要单独处理
                    checker.fileToSelectors(currentFile, cssNamesMap, ctx.inwatch);
                    scopedStyle += c;
                } else if (!i.exists) {
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
                scopedStyle = scopedStyle.replace(cssNameReg, (m, name, attr) => {
                    if (sToKeys[name]) {
                        attr = attr || '';
                        return '.' + sToKeys[name] + attr;
                    }
                    return m;
                });
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