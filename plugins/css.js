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
var cssTmplReg = /(['"]?)\(?(global|ref|names)?\u0012@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx)(?:\[([\w-,]+)\]|:([\w\-]+))?\)?\1(;?)/g;
var cssNameReg = /(?:@|global)?\.([\w\-]+)(\[[^\]]*?\])?(?=[^\{\}]*?\{)/g;
var cssCommentReg = /\s*\/\*[\s\S]+?\*\/\s*/g;
var cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx):([\w\-]+)\1\]/g;
var sep = path.sep;
var slashReg = /\//g;
var genCssNamesKey = function(file) {
    //获取模块的id
    var cssId = util.extractModuleId(file);
    if (configs.compressCss) {
        cssId = md5(cssId);
    } else {
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
    }
    //css前缀是配置项中的前缀加上模块的md5信息
    return (configs.cssSelectorPrefix || 'mx-') + cssId;
};
var genCssSelector = function(selector) {
    var mappedName = selector;
    if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (selector.length > configs.md5KeyLen) {
            mappedName = md5(selector);
        }
    }
    return mappedName;
};
module.exports = function(e) {
    var cssNamesMap = {};
    var gCSSNamesMap = {};
    var cssNamesKey;
    var addToGlobalCSS = true;
    //处理css类名
    var cssNameProcessor = function(m, name, attr) {
        attr = attr || '';
        if (m.indexOf('global') === 0) return m.slice(6);
        if (m.charAt(0) == '@') return m.slice(1); //@.rule
        var mappedName = genCssSelector(name);
        //只在原来的css类名前面加前缀
        var result = '.' + (cssNamesMap[name] = cssNamesKey + '-' + mappedName);
        if (addToGlobalCSS) { //是否增加到当前模块的全局css里，因为一个view.js可以依赖多个css文件
            gCSSNamesMap[name] = cssNamesMap[name];
        }
        return result + attr;
    };
    var refProcessor = function(m, q, file, ext, name) {
        file = path.resolve(path.dirname(e.from) + sep + file + ext);
        file = genCssNamesKey(file);
        name = genCssSelector(name);
        return '@.' + file + '-' + name;
    };
    var cssContentCache = {};
    return new Promise(function(resolve, reject) {
        if (cssTmplReg.test(e.content)) { //有需要处理的@规则
            var count = 0;
            var resume = function() {
                e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name, ext, keys, key, tail) {
                    name = atpath.resolveName(name, e.moduleId);
                    var file;
                    if (e.contentInfo && name == 'style') {
                        file = e.from;
                    } else {
                        file = path.resolve(path.dirname(e.from) + sep + name + ext);
                    }
                    var fileName = path.basename(file);
                    var r = cssContentCache[file];
                    //从缓存中获取当前文件的信息
                    //如果不存在就返回一个不存在的提示
                    if (!r.exists) return q + 'unfound:' + name + ext + q;
                    var fileContent = r.css;

                    cssNamesKey = genCssNamesKey(file);
                    if (prefix != 'global') { //如果不是项目中全局使用的
                        addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                        if (keys || key) { //有后缀时也不添加到全局
                            addToGlobalCSS = false;
                        }
                        cssNamesMap = {};
                        fileContent = fileContent.replace(cssRefReg, refProcessor);
                        fileContent = fileContent.replace(cssNameReg, cssNameProcessor); //前缀处理
                        //@规则处理
                        fileContent = cssAtRule(fileContent, cssNamesKey);
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
            var go = function() {
                count--;
                if (!count) { //依赖的文件全部读取完毕
                    resume();
                }
            };
            e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name, ext) {
                count++; //记录当前文件个数，因为文件读取是异步，我们等到当前模块依赖的css都读取完毕后才可以继续处理
                name = atpath.resolveName(name, e.moduleId); //先处理名称
                var file;
                if (e.contentInfo && name == 'style') {
                    file = e.from;
                } else {
                    file = path.resolve(path.dirname(e.from) + sep + name + ext);
                    deps.addFileDepend(file, e.from, e.to);
                    e.fileDeps[file] = 1;
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
                                    go();
                                }, function(error) {
                                    if (e.contentInfo) {
                                        file += '@' + e.contentInfo.fileName;
                                    }
                                    reject(error);
                                    console.log(file, error);
                                    go();
                                });
                            } else {
                                cssContentCache[file].css = info.content.replace(cssCommentReg, '');
                                go();
                            }
                        } else {
                            go();
                        }
                    }, reject);
                } else {
                    go();
                }
                return m;
            });
        } else {
            resolve(e);
        }
    });
};