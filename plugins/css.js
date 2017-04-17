let cssnano = require('cssnano');
let path = require('path');
let configs = require('./util-config');
let atpath = require('./util-atpath');
let util = require('./util');
let md5 = require('./util-md5');
let cssAtRule = require('./css-atrule');
let cssFileRead = require('./css-read');
let cssUrl = require('./css-url');
let deps = require('./util-deps');
let checker = require('./css-checker');
let sutil = require('util');
//处理css文件
//另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
//https://github.com/Automattic/xgettext-js
//处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
//"abc(@style.css:xx)yyzz"
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
let cssTmplReg = /(['"]?)\(?(global|ref|names)?\u0012@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style)(?:\[([\w-,]+)\]|:\.?([\w\-]+))?\)?\1(;?)/g;
let cssNameReg = /(?:@|global)?\.([\w\-]+)(\[[^\]]*?\])?(?=[^\{\}]*?\{)/g;
let cssCommentReg = /\s*\/\*[\s\S]+?\*\/\s*/g;
let cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style):([\w\-]+)\1\]/g;
let sep = path.sep;
let slashReg = /[\/\.]/g;
let genCssNamesKey = (file, ignorePrefix) => {
    //获取模块的id
    let cssId = util.extractModuleId(file);
    if (configs.compressCss) {
        cssId = md5(cssId, configs.md5CssFileLen, 'md5CssFileLen');
    } else {
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
    }
    //css前缀是配置项中的前缀加上模块的md5信息
    if (!ignorePrefix) {
        cssId = (configs.cssSelectorPrefix || 'mx-') + cssId;
    }
    return cssId;
};
let genCssSelector = (selector) => {
    let mappedName = selector;
    if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (selector.length > configs.md5CssSelectorLen) {
            mappedName = md5(selector, configs.md5CssSelectorLen);
        }
    }
    return mappedName;
};
let clone = (object) => {
    if (sutil.isArray(object)) {
        let ta = [];
        for (let i = 0; i < object.length; i++) {
            ta[i] = clone(object[i]);
        }
        return ta;
    } else if (sutil.isObject(object)) {
        let temp = {};
        for (let p in object) {
            temp[p] = clone(object[p]);
        }
        return temp;
    }
    return object;
};
let cloneAssign = (dest, src) => {
    Object.assign(dest, clone(src));
};
let tempGlobalCSSMap = {};
let tempGlobalCSSInFiles = {};
module.exports = (e, inwatch) => {
    if (inwatch) {
        checker.clearUsed(e.from);
    }
    let cssNamesMap = {};
    let cssNamesToFiles = {};
    let gCSSNamesMap = {};
    let cssNamesKey;
    let addToGlobalCSS = true;
    let gCSSNamesToFiles = {};
    let currentFile = '';
    let cssContentCache = {};
    let addGlobal = (name, transformSelector, guid, lazyGlobal) => {
        if (configs.log && gCSSNamesMap[name] && gCSSNamesToFiles[name] && !gCSSNamesToFiles[name][currentFile]) {
            checker.markExists(name, currentFile, Object.keys(gCSSNamesToFiles[name]) + '');
        }
        gCSSNamesMap[name] = transformSelector;
        if (!gCSSNamesToFiles[name]) {
            gCSSNamesToFiles[name] = {};
            gCSSNamesToFiles[name + '!s'] = {};
        } else if (!lazyGlobal && gCSSNamesToFiles[name + '!g'] != guid) {
            gCSSNamesToFiles[name + '!s'] = {};
        }

        gCSSNamesToFiles[name + '!g'] = guid;
        gCSSNamesToFiles[name][currentFile] = 1;
        if (!lazyGlobal) {
            gCSSNamesToFiles[name + '!s'][transformSelector] = currentFile;
        }
        if (lazyGlobal) {
            let list = gCSSNamesToFiles[name + '!r'];
            if (list && list.length >= 0) {
                if (!list[currentFile]) {
                    list[currentFile] = 1;
                    list.push(currentFile);
                }
            } else {
                gCSSNamesToFiles[name + '!r'] = [currentFile];
            }
            checker.markLazyDeclared(name);
        } else {
            gCSSNamesToFiles[name + '!r'] = [currentFile];
        }
    };
    //处理css类名
    let cssNameProcessor = (m, name, attr) => {
        attr = attr || '';
        if (m.indexOf('global') === 0) {
            name = m.slice(7);
            addGlobal(name, name, 0, true);
            return m.slice(6);
        }
        if (m.charAt(0) == '@') {
            name = m.slice(2);
            addGlobal(name, name, 0, true);
            return m.slice(1);
        }
        let mappedName = genCssSelector(name);
        //只在原来的css类名前面加前缀
        let result = (cssNamesMap[name] = cssNamesKey + '-' + mappedName);
        cssNamesToFiles[name + '!r'] = [currentFile];
        if (addToGlobalCSS) { //是否增加到当前模块的全局css里，因为一个view.js可以依赖多个css文件
            addGlobal(name, result);
        }
        return '.' + result + attr;
    };
    let refProcessor = (m, q, file, ext, name) => {
        file = path.resolve(path.dirname(e.from) + sep + file + ext);
        q = genCssNamesKey(file);
        name = genCssSelector(name);
        checker.markUsed(file, name, e.from);
        return '@.' + q + '-' + name;
    };
    if (inwatch || !genCssSelector.$promise) {
        genCssSelector.$scopedStyle = '';
        let processGlobal = () => {
            let globalGuid = Date.now();
            return new Promise((resolve) => {
                let list = configs.globalCss;
                if (!list || !list.length) {
                    resolve();
                } else {
                    let addToGlobal = (m, name) => {
                        cssNamesMap[name] = name;
                        addGlobal(name, name, globalGuid);
                    };
                    let add = (info) => {
                        cssNamesMap = {};
                        if (info.exists && info.content) {
                            currentFile = info.file;
                            info.content.replace(cssCommentReg, '').replace(cssNameReg, addToGlobal);
                            checker.fileToSelectors(currentFile, cssNamesMap, inwatch);
                        }
                    };
                    let ps = [];
                    for (let i = 0; i < list.length; i++) {
                        ps.push(cssFileRead(list[i], '', e));
                    }
                    Promise.all(ps).then((rs) => {
                        for (let i = 0; i < rs.length; i++) {
                            add(rs[i]);
                        }
                        for (let p in gCSSNamesToFiles) {
                            if (p.slice(-2, -1) == '!') continue;
                            let sameSelectors = gCSSNamesToFiles[p];
                            let values = Object.keys(sameSelectors);
                            if (values.length > 1) {
                                gCSSNamesToFiles[p + '!r'] = values;
                            }
                        }
                        cloneAssign(tempGlobalCSSMap, gCSSNamesMap);
                        cloneAssign(tempGlobalCSSInFiles, gCSSNamesToFiles);
                        //console.log(tempGlobalCSSInFiles);
                        resolve();
                    });
                }
            });
        };
        genCssSelector.$promise = processGlobal().then(() => {
            return new Promise((resolve) => {
                let list = configs.scopedCss;
                if (!list || !list.length) {
                    resolve();
                } else {
                    let add = (info) => {
                        cssNamesMap = {};
                        if (info.exists && info.content) {
                            currentFile = info.file;
                            // let keyFile = info.file;
                            // if (configs.compressCss) { //当压缩时，如果多个scoped文件，我们让它们的文件名称一样，这样当内部含有相同的选择器时，会自动合并处理
                            //     keyFile = 'scoped.style';
                            // }
                            cssNamesKey = genCssNamesKey(currentFile);
                            let c = info.content.replace(cssCommentReg, '');
                            c = c.replace(cssRefReg, refProcessor);
                            c = c.replace(cssNameReg, cssNameProcessor);
                            c = cssAtRule(c, genCssNamesKey(info.file)); //但处理at规则的时候，不同的文件，里面如果有相同的at规则不是能合并处理的，需要单独处理
                            checker.fileToSelectors(currentFile, cssNamesMap, inwatch);
                            genCssSelector.$scopedStyle += c;
                        }
                    };
                    let ps = [];
                    for (let i = 0; i < list.length; i++) {
                        ps.push(cssFileRead(list[i], '', e));
                    }
                    Promise.all(ps).then((rs) => {
                        for (let i = 0; i < rs.length; i++) {
                            add(rs[i]);
                        }
                        //if (!configs.compressCss) {
                        let sToKeys = {};
                        for (let p in gCSSNamesToFiles) {
                            if (p.slice(-2, -1) == '!') continue;
                            let sameSelectors = gCSSNamesToFiles[p + '!s'];
                            let values = Object.values(sameSelectors);
                            if (values.length > 1) {
                                gCSSNamesToFiles[p + '!r'] = values;
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
                                gCSSNamesMap[p] = key;
                                for (let z in sameSelectors) {
                                    sToKeys[z] = gCSSNamesMap[p];
                                }
                            }
                        }
                        genCssSelector.$scopedStyle = genCssSelector.$scopedStyle.replace(cssNameReg, (m, name, attr) => {
                            if (sToKeys[name]) {
                                attr = attr || '';
                                return '.' + sToKeys[name] + attr;
                            }
                            return m;
                        });
                        //}
                        cloneAssign(tempGlobalCSSMap, gCSSNamesMap);
                        cloneAssign(tempGlobalCSSInFiles, gCSSNamesToFiles);
                        resolve();
                    });
                }
            });
        });
    }
    return genCssSelector.$promise.then(() => {
        cloneAssign(gCSSNamesMap, tempGlobalCSSMap);
        cloneAssign(gCSSNamesToFiles, tempGlobalCSSInFiles);
        //console.log('is reset?', gCSSNamesToFiles);
        e.cssNamesMap = gCSSNamesMap;
        e.cssNamesInFiles = gCSSNamesToFiles;
        //console.log(e.cssNamesInFiles);
        //console.log('global', gCSSNamesMap);
        return new Promise((resolve, reject) => {
            if (cssTmplReg.test(e.content)) { //有需要处理的@规则
                let count = 0;
                let resume = () => {
                    e.content = e.content.replace(cssTmplReg, (m, q, prefix, name, ext, keys, key, tail) => {
                        let file, scopedStyle;
                        let markUsedFiles;
                        if (ext == '.style') {
                            if (name == 'scoped') {
                                scopedStyle = true;
                                markUsedFiles = configs.scopedCss;
                            }
                        }
                        if (scopedStyle) {
                            file = name + ext;
                        } else {
                            name = atpath.resolveName(name, e.moduleId);
                            if (e.contentInfo && name == 'style') {
                                file = e.from;
                            } else {
                                file = path.resolve(path.dirname(e.from) + sep + name + ext);
                            }
                            markUsedFiles = file;
                        }
                        let fileName = path.basename(file);
                        let r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) return q + 'unfound:' + name + ext + q;
                        let fileContent = r.css;

                        cssNamesKey = genCssNamesKey(file);
                        if (scopedStyle) {
                            cssNamesMap = gCSSNamesMap;
                        } else {
                            cssNamesMap = {};
                            cssNamesToFiles = {};
                            currentFile = file;
                            if (prefix != 'global') { //如果不是项目中全局使用的
                                addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                                if (keys || key) { //有后缀时也不添加到全局
                                    addToGlobalCSS = false;
                                }
                                if (!r.cssNames) {
                                    fileContent = fileContent.replace(cssRefReg, refProcessor);
                                    fileContent = fileContent.replace(cssNameReg, cssNameProcessor); //前缀处理
                                    checker.fileToSelectors(file, cssNamesMap, inwatch);
                                    //@规则处理
                                    fileContent = cssAtRule(fileContent, cssNamesKey);
                                    //if (addToGlobalCSS) {
                                    r.cssNames = cssNamesMap;
                                    r.namesToFiles = cssNamesToFiles;
                                    r.fileContent = fileContent;
                                    //}
                                } else {
                                    cssNamesMap = r.cssNames;
                                    cssNamesToFiles = r.namesToFiles;
                                    //console.log('cssNamesToFiles',cssNamesToFiles);
                                    fileContent = r.fileContent;
                                    if (addToGlobalCSS) {
                                        cloneAssign(gCSSNamesMap, cssNamesMap);
                                        cloneAssign(gCSSNamesToFiles, cssNamesToFiles);
                                    }
                                }
                            } else {
                                //global
                                let globals = configs.globalCss;
                                if (globals.indexOf(file) == -1) {
                                    fileContent.replace(cssRefReg, refProcessor).replace(cssNameReg, cssNameProcessor);
                                    checker.fileToSelectors(file, cssNamesMap, inwatch);
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
                            let c = cssNamesMap[key] || 'unfound-[' + key + ']-from-' + fileName;
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            let css = JSON.stringify(fileContent);
                            css = cssUrl(css);
                            replacement = '"' + cssNamesKey + '",' + css;
                        }
                        tail = tail ? tail : '';
                        return replacement + tail;
                    });
                    e.cssNamesMap = gCSSNamesMap;
                    e.cssNamesInFiles = gCSSNamesToFiles;
                    //console.log(e.from, e.cssNamesInFiles);
                    resolve(e);
                };
                let check = () => {
                    count--;
                    if (!count) { //依赖的文件全部读取完毕
                        resume();
                    }
                };
                e.content.replace(cssTmplReg, (m, q, prefix, name, ext) => {
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
                                content: genCssSelector.$scopedStyle
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
                                    process.nextTick(check);
                                }
                            } else {
                                process.nextTick(check);
                            }
                        }, reject).catch((ex) => {
                            console.log('css.js css-read exception:', ex);
                        });
                    } else {
                        process.nextTick(check);
                    }
                });
            } else {
                resolve(e);
            }
        });
    });
};