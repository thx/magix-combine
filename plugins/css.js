var cssnano = require('cssnano');
var path = require('path');
var configs = require('./util-config');
var atpath = require('./util-atpath');
var util = require('./util');
var md5 = require('./util-md5');
var cssAtRule = require('./css-atrule');
var cssFileRead = require('./css-read');
var cssUrl = require('./css-url');
var deps = require('./util-deps');
//处理css文件
//另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
//https://github.com/Automattic/xgettext-js
//处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
//"abc(@style.css:xx)yyzz"
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
var cssTmplReg = /(['"]?)\(?(global|ref|names)?\u0012@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style)(?:\[([\w-,]+)\]|:([\w\-]+))?\)?\1(;?)/g;
var cssNameReg = /(?:@|global)?\.([\w\-]+)(\[[^\]]*?\])?(?=[^\{\}]*?\{)/g;
var cssCommentReg = /\s*\/\*[\s\S]+?\*\/\s*/g;
var cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style):([\w\-]+)\1\]/g;
var sep = path.sep;
var slashReg = /[\/\.]/g;
var genCssNamesKey = function(file, ignorePrefix) {
    //获取模块的id
    var cssId = util.extractModuleId(file);
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
var genCssSelector = function(selector) {
    var mappedName = selector;
    if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (selector.length > configs.md5CssSelectorLen) {
            mappedName = md5(selector, configs.md5CssSelectorLen);
        }
    }
    return mappedName;
};
var tempGlobalCSSMap = {};
module.exports = function(e, inwatch) {
    var cssNamesMap = {};
    var gCSSNamesMap = {};
    var cssNamesKey;
    var addToGlobalCSS = true;
    var gCSSNamesToFiles = {};
    var currentFile = '';
    var addGlobal = function(name, transformSelector) {
        if (currentFile != 'scoped.style' && configs.log && gCSSNamesMap[name] && gCSSNamesToFiles[name] && !gCSSNamesToFiles[name][currentFile]) {
            console.log('css:already exists', name.red, 'current file', currentFile.grey, 'prev files', (Object.keys(gCSSNamesToFiles[name]) + '').blue);
        }
        gCSSNamesMap[name] = transformSelector;
        if (!gCSSNamesToFiles[name]) {
            gCSSNamesToFiles[name] = {};
            gCSSNamesToFiles[name + '!s'] = {};
        }
        gCSSNamesToFiles[name][currentFile] = 1;
        gCSSNamesToFiles[name + '!s'][transformSelector] = 1;
    };
    //处理css类名
    var cssNameProcessor = function(m, name, attr) {
        attr = attr || '';
        if (m.indexOf('global') === 0) return m.slice(6);
        if (m.charAt(0) == '@') return m.slice(1); //@.rule
        var mappedName = genCssSelector(name);
        //只在原来的css类名前面加前缀
        var result = (cssNamesMap[name] = cssNamesKey + '-' + mappedName);
        if (addToGlobalCSS) { //是否增加到当前模块的全局css里，因为一个view.js可以依赖多个css文件
            addGlobal(name, result);
        }
        return '.' + result + attr;
    };
    var refProcessor = function(m, q, file, ext, name) {
        file = path.resolve(path.dirname(e.from) + sep + file + ext);
        file = genCssNamesKey(file);
        name = genCssSelector(name);
        return '@.' + file + '-' + name;
    };
    var cssContentCache = {};
    if (inwatch || !genCssSelector.$promise) {
        genCssSelector.$gStyle = '';
        var processGlobal = function() {
            return new Promise(function(resolve) {
                var list = configs.globalCss;
                if (!list || !list.length) {
                    resolve();
                } else {
                    var addToGlobal = function(m, name) {
                        addGlobal(name, name);
                    };
                    var add = function(info) {
                        if (info.exists && info.content) {
                            currentFile = info.file;
                            info.content.replace(cssNameReg, addToGlobal);
                        }
                    };
                    var ps = [];
                    for (var i = 0; i < list.length; i++) {
                        ps.push(cssFileRead(list[i], '', e));
                    }
                    Promise.all(ps).then(function(rs) {
                        for (var i = 0; i < rs.length; i++) {
                            add(rs[i]);
                        }
                        Object.assign(tempGlobalCSSMap, gCSSNamesMap);
                        resolve();
                    });
                }
            });
        };
        genCssSelector.$promise = processGlobal().then(function() {
            return new Promise(function(resolve) {
                var list = configs.scopedAsGlobalCss;
                if (!list || !list.length) {
                    resolve();
                } else {
                    var add = function(info) {
                        addToGlobalCSS = 1;
                        cssNamesMap = {};
                        if (info.exists && info.content) {
                            if (configs.compressCss) {
                                info.file = 'scoped.style';
                            }
                            currentFile = info.file;
                            cssNamesKey = genCssNamesKey(info.file);
                            var c = info.content.replace(cssCommentReg, '');
                            c = c.replace(cssRefReg, refProcessor);
                            c = c.replace(cssNameReg, cssNameProcessor);
                            c = cssAtRule(c, cssNamesKey);
                            genCssSelector.$gStyle += c;
                        }
                    };
                    var ps = [];
                    for (var i = 0; i < list.length; i++) {
                        ps.push(cssFileRead(list[i], '', e));
                    }
                    Promise.all(ps).then(function(rs) {
                        for (var i = 0; i < rs.length; i++) {
                            add(rs[i]);
                        }
                        if (!configs.compressCss) {
                            var sToKeys = {};
                            for (var p in gCSSNamesToFiles) {
                                var files = gCSSNamesToFiles[p];
                                var keys = Object.keys(files);
                                if (keys.length > 1) {
                                    var key = [],
                                        k;
                                    for (i = 0; i < keys.length; i++) {
                                        k = genCssNamesKey(keys[i], i);
                                        key.push(k);
                                    }
                                    var s = gCSSNamesToFiles[p + '!s'];
                                    gCSSNamesMap[p] = key.join('-and-') + '-' + p;
                                    for (var z in s) {
                                        sToKeys[z] = gCSSNamesMap[p];
                                    }
                                }
                            }
                            genCssSelector.$gStyle = genCssSelector.$gStyle.replace(cssNameReg, function(m, name, attr) {
                                if (sToKeys[name]) {
                                    attr = attr || '';
                                    return '.' + sToKeys[name] + attr;
                                }
                                return m;
                            });
                        }
                        Object.assign(tempGlobalCSSMap, gCSSNamesMap);
                        resolve();
                    });
                }
            });
        });
    }
    return genCssSelector.$promise.then(function() {
        Object.assign(gCSSNamesMap, tempGlobalCSSMap);
        e.cssNamesMap = gCSSNamesMap;
        //console.log('global', gCSSNamesMap);
        return new Promise(function(resolve, reject) {
            if (cssTmplReg.test(e.content)) { //有需要处理的@规则
                var count = 0;
                var resume = function() {
                    e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name, ext, keys, key, tail) {
                        var file, globalStyle = name == 'scoped' && ext == '.style';
                        if (globalStyle) {
                            file = name + ext;
                        } else {
                            name = atpath.resolveName(name, e.moduleId);
                            if (e.contentInfo && name == 'style') {
                                file = e.from;
                            } else {
                                file = path.resolve(path.dirname(e.from) + sep + name + ext);
                            }
                        }
                        var fileName = path.basename(file);
                        var r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) return q + 'unfound:' + name + ext + q;
                        var fileContent = r.css;

                        cssNamesKey = genCssNamesKey(file);
                        if (prefix != 'global') { //如果不是项目中全局使用的
                            if (globalStyle) {
                                cssNamesMap = gCSSNamesMap;
                                fileContent = genCssSelector.$gStyle;
                            } else {
                                addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                                if (keys || key) { //有后缀时也不添加到全局
                                    addToGlobalCSS = false;
                                }
                                cssNamesMap = {};
                                currentFile = file;
                                fileContent = fileContent.replace(cssRefReg, refProcessor);
                                fileContent = fileContent.replace(cssNameReg, cssNameProcessor); //前缀处理
                                //@规则处理
                                fileContent = cssAtRule(fileContent, cssNamesKey);
                            }
                        }
                        var replacement;
                        if (prefix == 'names') { //如果是读取css选择器名称对象
                            if (keys) { //从对象中只挑取某几个key
                                replacement = JSON.stringify(cssNamesMap, keys.split(','));
                            } else { //全部名称对象
                                replacement = JSON.stringify(cssNamesMap);
                            }
                        } else if (prefix == 'ref') { //如果是引用css则什么都不用做
                            replacement = '';
                            tail = '';
                        } else if (key) { //仅读取文件中的某个名称
                            var c = cssNamesMap[key] || 'unfound-[' + key + ']-from-' + fileName;
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            var css = JSON.stringify(fileContent);
                            css = cssUrl(css);
                            replacement = '"' + cssNamesKey + '",' + css;
                        }
                        tail = tail ? tail : '';
                        return replacement + tail;
                    });
                    e.cssNamesMap = gCSSNamesMap;
                    resolve(e);
                };
                var check = function() {
                    count--;
                    if (!count) { //依赖的文件全部读取完毕
                        resume();
                    }
                };
                e.content.replace(cssTmplReg, function(m, q, prefix, name, ext) {
                    count++; //记录当前文件个数，因为文件读取是异步，我们等到当前模块依赖的css都读取完毕后才可以继续处理

                    var file;
                    if (name == 'scoped' && ext == '.style') {
                        file = name + ext;
                        cssContentCache[file] = {
                            exists: true,
                            css: genCssSelector.$gStyle
                        };
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
                        //调用 css 文件读取模块
                        cssFileRead(file, name, e).then(function(info) {
                            //写入缓存，因为同一个view.js中可能对同一个css文件多次引用
                            cssContentCache[file] = {
                                exists: info.exists,
                                css: ''
                            };
                            if (info.exists && info.content) {
                                if (configs.compressCss) {
                                    cssnano.process(info.content, configs.cssnanoOptions).then(function(r) {
                                        cssContentCache[file].css = r.css;
                                        check();
                                    }, function(error) {
                                        if (e.contentInfo) {
                                            file += '@' + e.contentInfo.fileName;
                                        }
                                        reject(error);
                                        console.log(file, error);
                                        check();
                                    });
                                } else {
                                    cssContentCache[file].css = info.content.replace(cssCommentReg, '');
                                    check();
                                }
                            } else {
                                check();
                            }
                        }, reject).catch(function(ex) {
                            console.log('css.js css-read exception:', ex);
                        });
                    } else {
                        check();
                    }
                });
            } else {
                resolve(e);
            }
        });
    });
};