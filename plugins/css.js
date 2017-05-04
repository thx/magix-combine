let cssnano = require('cssnano');
let path = require('path');
let configs = require('./util-config');
let atpath = require('./util-atpath');
let cssAtRule = require('./css-atrule');
let cssFileRead = require('./css-read');
let cssUrl = require('./css-url');
let deps = require('./util-deps');
let checker = require('./css-checker');
let cssGlobal = require('./css-global');
let utils = require('./util');
let cloneAssign = utils.cloneAssign;
let {
    cssNameNewProcessor,
    cssNameGlobalProcessor,
    genCssNamesKey,
    genCssSelector,
    cssRefReg,
    cssCommentReg
} = require('./css-selector');
//处理css文件
//另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
//https://github.com/Automattic/xgettext-js
//处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
//"abc(@style.css:xx)yyzz"
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
let cssTmplReg = /(['"]?)\(?(global|ref|names)?\u0012@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style)(?:\[([\w-,]+)\]|:\.?([\w\-]+))?\)?\1(;?)/g;
let sep = path.sep;


module.exports = (e, inwatch) => {
    if (inwatch) {
        checker.clearUsed(e.from);
        checker.clearUsedTags(e.from);
    }
    let cssNamesMap = {};
    let cssNamesToFiles = {};
    let cssNamesKey;
    let addToGlobalCSS = true;

    let gCSSNamesMap = {};
    let gCSSNamesToFiles = {};
    let currentFile = '';
    let cssContentCache = {};
    let gCSSTagToFiles = {};

    let refProcessor = (m, q, file, ext, name) => {
        file = path.resolve(path.dirname(e.from) + sep + file + ext);
        q = genCssNamesKey(file);
        name = genCssSelector(name);
        checker.markUsed(file, name, e.from);
        return '@.' + q + '-' + name;
    };
    return cssGlobal.process({
        context: e,
        inwatch: inwatch,
        refProcessor: refProcessor
    }).then((gInfo) => {
        //console.log(e.cssNamesInFiles);
        //console.log('global', gCSSNamesMap);
        return new Promise((resolve, reject) => {
            cloneAssign(gCSSNamesMap, gInfo.globalCssNamesMap);
            cloneAssign(gCSSNamesToFiles, gInfo.globalCssNamesInFiles);
            cloneAssign(gCSSTagToFiles, gInfo.globalCssTagsInFiles);
            e.cssNamesMap = gCSSNamesMap;
            e.cssNamesInFiles = gCSSNamesToFiles;
            e.cssTagsInFiles = gCSSTagToFiles;
            if (cssTmplReg.test(e.content)) { //有需要处理的@规则
                cssTmplReg.lastIndex = 0;
                let count = 0;
                let resume = () => {
                    e.content = e.content.replace(cssTmplReg, (m, q, prefix, name, ext, keys, key, tail) => {
                        let file, scopedStyle;
                        let markUsedFiles;
                        let shortCssFile;
                        if (ext == '.style') {
                            if (name == 'scoped') {
                                scopedStyle = true;
                                markUsedFiles = configs.scopedCss;
                            }
                        }
                        if (scopedStyle) {
                            file = name + ext;
                            shortCssFile = file;
                        } else {
                            name = atpath.resolveName(name, e.moduleId);
                            if (e.contentInfo && name == 'style') {
                                file = e.from;
                            } else {
                                file = path.resolve(path.dirname(e.from) + sep + name + ext);
                            }
                            markUsedFiles = file;
                            shortCssFile = file.replace(configs.moduleIdRemovedPath, '').slice(1);
                        }
                        let fileName = path.basename(file);
                        let r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) {
                            checker.markUnexists(m, e.from);
                            return q + 'unfound:' + name + ext + q;
                        }
                        let fileContent = r.css;
                        cssNamesKey = genCssNamesKey(file);
                        if (scopedStyle) {
                            cssNamesMap = gCSSNamesMap;
                        } else {
                            cssNamesMap = {};
                            cssNamesToFiles = {};
                            currentFile = file;
                            let cssTagsToFiles = {};
                            let cssTagsMap = {};
                            if (prefix != 'global') { //如果不是项目中全局使用的
                                addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                                if (keys || key) { //有后缀时也不添加到全局
                                    addToGlobalCSS = false;
                                }
                                if (!r.cssNames) {
                                    fileContent = fileContent.replace(cssRefReg, refProcessor);
                                    try {
                                        fileContent = cssNameNewProcessor(fileContent, {
                                            shortFile: shortCssFile,
                                            namesMap: gCSSNamesMap,
                                            namesToFiles: gCSSNamesToFiles,
                                            namesKey: cssNamesKey,
                                            cNamesMap: cssNamesMap,
                                            cNamesToFiles: cssNamesToFiles,
                                            addToGlobalCSS: addToGlobalCSS,
                                            file: currentFile,
                                            fileTags: cssTagsMap,
                                            tagsToFiles: cssTagsToFiles
                                        });
                                    } catch (ex) {
                                        reject(ex);
                                    }
                                    //@规则处理
                                    fileContent = cssAtRule(fileContent, cssNamesKey);
                                    //if (addToGlobalCSS) {
                                    r.cssNames = cssNamesMap;
                                    r.fileContent = fileContent;
                                    r.namesToFiles = cssNamesToFiles;
                                    r.tagsToFiles = cssTagsToFiles;
                                    r.cssTags = cssTagsMap;
                                    cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                    checker.fileToTags(file, cssTagsMap, inwatch);
                                    checker.fileToSelectors(file, cssNamesMap, inwatch);
                                    //}
                                } else {
                                    cssNamesMap = r.cssNames;
                                    cssNamesToFiles = r.namesToFiles;
                                    cssTagsToFiles = r.tagsToFiles;
                                    fileContent = r.fileContent;
                                    if (addToGlobalCSS) {
                                        cloneAssign(gCSSNamesMap, cssNamesMap);
                                        cloneAssign(gCSSNamesToFiles, cssNamesToFiles);
                                        cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                    }
                                }
                            } else {
                                //global
                                let globals = configs.globalCss;
                                let unchecked = configs.uncheckGlobalCss;
                                if (globals.indexOf(file) == -1) {
                                    if (unchecked.indexOf(file) == -1) {
                                        fileContent.replace(cssRefReg, refProcessor);
                                        try {
                                            cssNameGlobalProcessor(fileContent, {
                                                shortFile: shortCssFile,
                                                namesMap: gCSSNamesMap,
                                                namesToFiles: gCSSNamesToFiles,
                                                cNamesMap: cssNamesMap,
                                                cNamesToFiles: cssNamesToFiles,
                                                lazyGlobal: true,
                                                file: currentFile,
                                                fileTags: cssTagsMap,
                                                tagsToFiles: cssTagsToFiles
                                            });
                                        } catch (ex) {
                                            reject(ex);
                                        }
                                        cssGlobal.add(file, cssNamesMap, cssNamesToFiles);
                                        cloneAssign(gCSSNamesMap, cssNamesMap);
                                        cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                        checker.fileToSelectors(file, cssNamesMap, inwatch);
                                        checker.fileToTags(file, cssTagsMap, inwatch);
                                    }
                                    checker.markGlobal(e.from, 'global@' + name + ext);
                                }
                            }
                        }
                        let replacement;
                        if (prefix == 'names') { //如果是读取css选择器名称对象
                            if (keys) { //从对象中只挑取某几个key
                                checker.markUsed(markUsedFiles, keys.split(','), e.from);
                                replacement = JSON.stringify(cssNamesMap, keys.split(','));
                            } else { //全部名称对象
                                checker.markUsed(markUsedFiles, Object.keys(cssNamesMap), e.from);
                                replacement = JSON.stringify(cssNamesMap);
                            }
                        } else if (prefix == 'ref') { //如果是引用css则什么都不用做
                            replacement = '';
                            tail = '';
                        } else if (key) { //仅读取文件中的某个名称
                            checker.markUsed(markUsedFiles, key, e.from);
                            let c = cssNamesMap[key];
                            if (!c) {
                                checker.markUnexists(m, e.from);
                                c = 'unfound-[' + key + ']-from-' + fileName;
                            }
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            let css = JSON.stringify(fileContent);
                            css = cssUrl(css, shortCssFile);
                            replacement = '"' + cssNamesKey + '",' + css;
                        }
                        tail = tail ? tail : '';
                        return replacement + tail;
                    });
                    resolve(e);
                };
                let check = () => {
                    count--;
                    if (!count && !check.$resume) { //依赖的文件全部读取完毕
                        check.$resume = true;
                        resume();
                    }
                };
                let processFile = (name, ext) => {
                    count++; //记录当前文件个数，因为文件读取是异步，我们等到当前模块依赖的css都读取完毕后才可以继续处理

                    let file, scopedStyle = false;
                    if (name == 'scoped' && ext == '.style') {
                        file = name + ext;
                        scopedStyle = true;
                        configs.scopedCss.forEach((sc) => {
                            deps.addFileDepend(sc, e.from, e.to);
                        });
                    } else {
                        name = atpath.resolveName(name, e.moduleId); //先处理名称
                        if (e.contentInfo && name == 'style') {
                            file = e.from;
                        } else {
                            file = path.resolve(path.dirname(e.from) + sep + name + ext);
                            deps.addFileDepend(file, e.from, e.to);
                            e.fileDeps[file] = 1;
                        }
                    }
                    if (!cssContentCache[file]) { //文件尚未读取
                        cssContentCache[file] = 1;
                        let promise;
                        if (scopedStyle) {
                            promise = Promise.resolve({
                                exists: true,
                                content: gInfo.scopedStyle
                            });
                        } else {
                            promise = cssFileRead(file, name, e);
                        }
                        promise.then((info) => {
                            //写入缓存，因为同一个view.js中可能对同一个css文件多次引用
                            cssContentCache[file] = {
                                exists: info.exists,
                                css: ''
                            };
                            if (info.exists && info.content) {
                                if (configs.compressCss) {
                                    cssnano.process(info.content, configs.cssnanoOptions).then((r) => {
                                        cssContentCache[file].css = r.css;
                                        check();
                                    }, (error) => {
                                        if (e.contentInfo) {
                                            file += '@' + e.contentInfo.fileName;
                                        }
                                        reject(error);
                                        check();
                                    });
                                } else {
                                    cssContentCache[file].css = info.content.replace(cssCommentReg, '');
                                    check();
                                }
                            } else {
                                check();
                            }
                        }, reject);
                    } else {
                        check();
                    }
                };
                let tasks = [];
                let doTask = () => {
                    if (tasks.length) {
                        let i = 0;
                        while (i < tasks.length) {
                            processFile.apply(null, tasks[i++]);
                        }
                    } else {
                        resume();
                    }
                };
                e.content.replace(cssTmplReg, (m, q, prefix, name, ext) => {
                    tasks.push([name, ext]);
                });
                doTask();
            } else {
                resolve(e);
            }
        });
    });
};