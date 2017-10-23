/*
    全局样式的处理
    1.　不推荐的global样式
    2.　全局scoped样式
    https://github.com/thx/magix-combine/issues/24
 */
let configs = require('./util-config');
let checker = require('./checker');
let cssFileRead = require('./css-read');
let cssAtRule = require('./css-atrule');
let cssParser = require('./css-parser');
let cssComment = require('./css-comment');
let {
    cssRefReg,
    refProcessor,
    genCssNamesKey,
    cssNameNewProcessor,
    cssNameGlobalProcessor,
    genCssSelector
} = require('./css-selector');
let globalCssNamesMap = Object.create(null);
let globalCssNamesInFiles = Object.create(null);
let globalCssTagsInFiles = Object.create(null);
let scopedStyle = '';
let scopedStyles = [];
let globalPromise;
let lazyGlobalInfo = Object.create(null);
let processGlobal = ctx => { //处理全局样式，因全局样式过于自由，不建议使用
    globalCssNamesMap = Object.create(null); //样式名映射，原始到压缩的映射
    globalCssNamesInFiles = Object.create(null); //样式名到文件的映射
    globalCssTagsInFiles = Object.create(null); //标签名到样式的映射
    let globalGuid = Date.now(); //guid
    /*
        guid 2种情况
        1.　全局样式在多个文件中出现重名时，合并这些全局样式
        2.　局部样式与全局重名时，只使用局部样式
        该guid只有全局的情况下才会传递，因此通过该guid识别如何处理样式规则
     */
    return new Promise((resolve, reject) => {
        let list = configs.globalCss; //全局配置
        if (!list || !list.length) { //没有配置
            resolve(ctx);
        } else {
            let add = info => {
                let cssNamesMap = Object.create(null);
                let fileTags = Object.create(null);
                if (info.exists && info.content) {
                    let cmtStore = Object.create(null);
                    let currentFile = info.file;
                    let css = cssComment.store(info.content, cmtStore);//.replace(cssCommentReg, '');
                    try {
                        cssNameGlobalProcessor(css, {
                            shortFile: currentFile.replace(configs.moduleIdRemovedPath, '').slice(1), //短文件名
                            globalGuid: globalGuid,
                            namesMap: globalCssNamesMap,
                            namesToFiles: globalCssNamesInFiles,
                            cNamesMap: cssNamesMap, //单个文件中名称映射
                            file: currentFile,
                            fileTags: fileTags, //文件中声明了哪些标签样式
                            tagsToFiles: globalCssTagsInFiles //标签在哪些文件里
                        });
                    } catch (e) {
                        reject(e);
                    }
                    //添加到检测信息中，编译完成时统一检测
                    checker.CSS.fileToTags(currentFile, fileTags, ctx.inwatch);
                    checker.CSS.fileToSelectors(currentFile, cssNamesMap, ctx.inwatch);
                }
            };
            let ps = [];
            for (let i = 0; i < list.length; i++) {
                ps.push(cssFileRead(list[i], '', ctx.context)); //读取
            }
            Promise.all(ps).then(rs => {
                for (let i = 0; i < rs.length; i++) {
                    add(rs[i]);
                }
                for (let p in globalCssNamesInFiles) {
                    if (p.slice(-2, -1) == '!') continue;
                    let sameSelectors = globalCssNamesInFiles[p];
                    let values = Object.keys(sameSelectors);
                    if (values.length > 1) { //处理同一个样式名存在多个文件中，即重名的情况
                        globalCssNamesInFiles[p + '!r'] = values;
                    }
                }
                resolve(ctx);
            }).catch(reject);
        }
    });
};
let processScope = ctx => {
    scopedStyle = '';
    scopedStyles = [];
    //console.log('process scoped'.red);
    return new Promise((resolve, reject) => { //处理scoped样式
        let list = configs.scopedCss;
        if (!list || !list.length) {
            resolve(ctx);
        } else {
            let add = i => {
                let cssNamesMap = Object.create(null);
                let cssTagsMap = Object.create(null);
                let currentFile = i.file;
                let cssNamesKey = genCssNamesKey(configs.debug ? currentFile : 'scoped.style');
                if (i.exists && i.content) {
                    let cmtStore = Object.create(null);
                    let c = cssComment.store(i.content, cmtStore);//.replace(cssCommentReg, '');
                    c = c.replace(cssRefReg, (m, q, file, ext, selector) => {
                        return refProcessor(i.file, file, ext, selector);
                    });
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
                    c = cssAtRule(c, cssNamesKey, true);
                    c = cssComment.recover(c, cmtStore);
                    checker.CSS.fileToSelectors(currentFile, cssNamesMap, ctx.inwatch);
                    checker.CSS.fileToTags(currentFile, cssTagsMap, ctx.inwatch);
                    scopedStyles.push({
                        css: c,
                        map: i.map,
                        key: cssNamesKey
                    });
                    scopedStyle += c;
                } else if (!i.exists) { //未找到
                    checker.CSS.markUnexists(currentFile, '/scoped.style');
                    scopedStyle += ' unfound-' + currentFile;
                    scopedStyles.push({
                        css: ' unfound-' + currentFile,
                        map: i.map,
                        key: cssNamesKey
                    });
                }
            };
            let ps = [];
            for (let i = 0; i < list.length; i++) {
                ps.push(cssFileRead(list[i], '', ctx.context));
            }
            Promise.all(ps).then(rs => {
                for (let i = 0; i < rs.length; i++) {
                    add(rs[i]);
                }
                //if (!configs.compressCss) {
                let sToKeys = Object.create(null); //重名
                let namesToFiles = globalCssNamesInFiles;
                let namesMap = globalCssNamesMap;
                for (let p in namesToFiles) {
                    if (p.slice(-2, -1) == '!') continue;
                    let sameSelectors = namesToFiles[p + '!s'];
                    let values = Object.values(sameSelectors); //处理重名的情况
                    if (values.length > 1) {
                        namesToFiles[p + '!r'] = values;
                        let key = '';
                        if (!configs.debug) { //压缩
                            key = genCssSelector(p, genCssNamesKey(values[0]));
                        } else { //非压缩时，采用这个重名在这几个文件中的路径做为key,如 mx-app-snippets-list-and-app-snippets-form
                            let keys = [],
                                k;
                            for (let i = 0; i < values.length; i++) {
                                k = genCssNamesKey(values[i], i);
                                keys.push(k);
                            }
                            key = genCssSelector(p, keys.join('-and-'));
                        }
                        namesMap[p] = key;
                        for (let z in sameSelectors) {
                            sToKeys[z] = namesMap[p]; //重名的特殊处理
                        }
                    }
                }
                let tokens = cssParser(scopedStyle, 'scoped.style').tokens;
                for (let i = tokens.length - 1; i >= 0; i--) {
                    let token = tokens[i];
                    let id = token.name;
                    if (token.type == 'class') {
                        if (sToKeys[id]) { //修改样式，只处理重名的，因为要对重名的样式重新命名
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
                    scopedStyle,
                    scopedStyles: configs.debug && configs.cssSourceMap ? scopedStyle : null
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
        if (file && (configs.globalCssMap[file] || configs.scopedCssMap[file])) {
            globalPromise = null;
            cssAtRule.reset();
        }
        let info = lazyGlobalInfo[file];
        if (info) {
            info.a = null;
            info.b = null;
        }
    }
};