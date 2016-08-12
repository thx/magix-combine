var crypto = require('crypto');
var Buffer = require('buffer').Buffer;
var fs = require('fs');
var path = require('path');
var cssnano = require('cssnano');
var htmlminifier = require('html-minifier');
var less = require('less');
var sass = require('node-sass');
var sep = path.sep;
var sepRegTmpl = sep.replace(/\\/g, '\\\\');
var sepReg = new RegExp(sepRegTmpl, 'g');

var configs = {
    tmplFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    srcFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    buildFolder: 'build', //压缩上线文件夹
    cssnanoOptions: { //css压缩选项
        safe: true
    },
    lessOptions: {}, //less编译选项
    sassOptions: {}, //sass编译选项
    cssSelectorPrefix: 'mx-', //css选择器前缀，通常可以是项目的简写，多个项目同时运行在magix中时有用
    loaderType: 'cmd', //加载器类型
    htmlminifierOptions: { //html压缩器选项 https://www.npmjs.com/package/html-minifier
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        //removeAttributeQuotes: true, //属性引号
        quoteCharacter: '"',
        keepClosingSlash: true //
    },
    outputTmplObject: false, //输出模板字符串为一个对象
    excludeTmplFolders: [], //不让该工具处理的文件夹或文件
    snippets: {}, //代码片断，对于在项目中重复使用且可能修改的html代码片断有用
    compressCssSelectorNames: false, //是否压缩css选择器名称，默认只添加前缀，方便调试
    atAttrProcessor: function(name, tmpl) { //对于html字符串中带@属性的特殊处理器，扩展用
        return tmpl;
    },
    compressTmplCommand: function(tmpl) { //压缩模板命令，扩展用
        return tmpl;
    },
    processAttachedFile: function() { //让外部决定如何处理同名的html或css文件，默认magix一个区块由html,css,js组成，如index.html index.css index.js 。打包时默认这3个文件打包成一个js文件，但有时候像css一些项目并不希望打包到js中，所以可以实现该方法来决定自己的方案

    }
};
var writeFile = function(to, content) { //文件写入
    var folders = path.dirname(to).split(sep);
    var p = '';
    while (folders.length) {
        p += folders.shift() + sep;
        if (!fs.existsSync(p)) {
            fs.mkdirSync(p);
        }
    }
    fs.writeFileSync(to, content);
};
var copyFile = function(from, to) { //复制文件
    if (fs.existsSync(from)) {
        var content = readFile(from, true);
        writeFile(to, content);
    }
};
var walk = function(folder, callback) { //遍历文件夹及子、孙文件夹下的文件
    var files = fs.readdirSync(folder);
    files.forEach(function(file) {
        var p = folder + sep + file;
        var stat = fs.lstatSync(p);
        if (stat.isDirectory()) {
            walk(p, callback);
        } else {
            callback(p);
        }
    });
};
var md5Cache = {}; //md5 cache对象
var md5ResultKey = '_$%'; //一个特殊前缀，因为要把源字符串结果及生成的3位md5存放在同一个对象里，加一个前缀以示区别
var md5 = function(text) {
    if (md5Cache[text]) return md5Cache[text];
    var buf = new Buffer(text);
    var str = buf.toString('binary');
    str = crypto.createHash('md5').update(str).digest('hex');
    var c = 0;
    var rstr = str.substring(c, c + 3); //从md5字符串中截取3个，md5太长了，3位足够，不使用随机数是因为我们要针对同一个文件每次生成的结果要相同
    while (md5Cache[md5ResultKey + rstr] == 1) { //不同的文件，但生成了相同的key
        c++;
        rstr = str.substring(c, c + 3);
    }
    md5Cache[text] = rstr;
    md5Cache[md5ResultKey + rstr] = 1;
    return rstr;
};
var readFile = function(file, original) { //读取文件
    var c = fs.readFileSync(file);
    if (!original) c = c + '';
    return c;
};
//以@开头的路径转换
var relativePathReg = /(['"])@([^\/]+)([^\s;]+?)(?=\\?\1)/g;
//处理@开头的路径，如果是如'@coms/dragdrop/index'则转换成相对当前模块的相对路径，如果是如 mx-view="@./list" 则转换成 mx-view="app/views/reports/list"完整的模块路径
var resolveAtPath = function(content, from) {
    var folder = from.substring(0, from.lastIndexOf('/') + 1);
    var tp;
    return content.replace(relativePathReg, function(m, q, l, p) {
        if (l.charAt(0) == '.') //以.开头我们认为是相对路径，则转完整模块路径
            tp = q + path.normalize(folder + l + p);
        else
            tp = q + path.relative(folder, l + p);
        tp = tp.replace(sepReg, '/');
        return tp;
    });
};
//处理@名称，如'@../default.css'
var resolveAtName = function(name, moduleId) {
    if (name.indexOf('/') >= 0 && name.charAt(0) != '.') {
        name = resolveAtPath('"@' + name + '"', moduleId).slice(1, -1);
    }
    return name;
};
//文件依赖信息对象，如index.js中@了index.css，则index.css被修改时，我们要编译index.js，即被依赖的模块变化要让有依赖的模块编译一次
var fileDependencies = {};
//添加文件依赖关系
var addFileDepend = function(file, dependFrom, dependTo) {
    var list = fileDependencies[file];
    if (!list) {
        list = fileDependencies[file] = {};
    }
    list[dependFrom] = dependTo;
};
//运行依赖列表
var runFileDepend = function(file) {
    var list = fileDependencies[file];
    if (list) {
        for (var p in list) {
            Processor.run('file', 'process', [p, list[p], true]);
        }
    }
};
//移除文件依赖
var removeFileDepend = function(file) {
    delete fileDependencies[file];
};
var jsReg = /\.js$/i;
var startSlashReg = /^\//;
//抽取模块id,如文件物理路径为'/users/xiglie/afp/tmpl/app/views/default.js'
//则抽取出来的模块id是 app/vies/default
var extractModuleId = function(file) {
    return file.replace(configs.moduleIdRemovedPath, '')
        .replace(jsReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
};
//初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
var initFolder = function() {
    if (!configs.initedFolder) {
        configs.initedFolder = 1;
        configs.tmplFolder = path.resolve(configs.tmplFolder);
        configs.srcFolder = path.resolve(configs.srcFolder);
        configs.buildFolder = path.resolve(configs.buildFolder);

        var tmplFolderName = path.basename(configs.tmplFolder);
        var srcFolderName = path.basename(configs.srcFolder);
        var buildFolderName = path.basename(configs.buildFolder);
        configs.moduleIdRemovedPath = path.resolve(configs.tmplFolder); //把路径中开始到模板目录移除就基本上是模块路径了
        configs.tmplReg = new RegExp('(' + sepRegTmpl + '?)' + tmplFolderName + sepRegTmpl);
        configs.srcHolder = '$1' + srcFolderName + sep;
        configs.srcReg = new RegExp('(' + sepRegTmpl + '?)' + srcFolderName + sepRegTmpl);
        configs.buildHolder = '$1' + buildFolderName + sep;
    }
};
var processorMap = {};
//工具模块处理器
var Processor = {
    add: function(key, factory) {
        processorMap[key] = factory();
    },
    run: function(key, fn, args) {
        var p = processorMap[key];
        var f = p && p[fn];
        if (f) {
            return f.apply(Processor, args);
        }
        return Promise.reject('unfound:' + key + '.' + fn);
    }
};
//css @规则的处理
Processor.add('css:atrule', function() {
    return {
        process: function(fileContent, cssNamesKey) {
            //以@开始的名称，如@font-face
            var cssAtNamesKeyReg = /(^|[\s\}])@([a-z\-]+)\s*([\w\-]+)?\{([^\{\}]*)\}/g;
            //keyframes，如@-webkit-keyframes xx
            var cssKeyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+([\w\-]+)/g;
            var contents = [];
            //先处理keyframes
            fileContent = fileContent.replace(cssKeyframesReg, function(m, head, keyframe, name) {
                //把名称保存下来，因为还要修改使用的地方
                contents.push(name);
                //增加前缀
                return head + keyframe + ' ' + cssNamesKey + '-' + name;
            });
            //处理其它@规则，这里只处理了font-face
            fileContent = fileContent.replace(cssAtNamesKeyReg, function(match, head, key, name, content) {
                if (key == 'font-face') {
                    //font-face只处理font-family
                    var m = content.match(/font-family\s*:\s*(['"])?([\w\-]+)\1/);
                    if (m) {
                        //同样保存下来，要修改使用的地方
                        contents.push(m[2]);
                    }
                }
                return match;
            });
            while (contents.length) {
                var t = contents.pop();
                //修改使用到的地方
                var reg = new RegExp(':\\s*([\'"])?' + t.replace(/[\-#$\^*()+\[\]{}|\\,.?\s]/g, '\\$&') + '\\1', 'g');
                fileContent = fileContent.replace(reg, ':$1' + cssNamesKey + '-' + t + '$1');
            }
            return fileContent;
        }
    };
});
//css 文件读取模块，我们支持.css .less .scss文件，所以该模块负责根据文件扩展名编译读取文件内容，供后续的使用
Processor.add('css:read', function() {
    return {
        process: function(file) {
            return new Promise(function(resolve) {
                fs.access(file, (fs.constants ? fs.constants.R_OK : fs.R_OK), function(err) {
                    if (err) {
                        resolve({
                            exists: false
                        });
                    } else {
                        var ext = path.extname(file);
                        if (ext == '.scss') {
                            configs.sassOptions.file = file;
                            sass.render(configs.sassOptions, function(err, result) {
                                if (err) {
                                    console.log('scss error:', err);
                                }
                                resolve({
                                    exists: true,
                                    content: err || result.css.toString()
                                });
                            });
                        } else if (ext == '.less') {
                            var fileContent = readFile(file);
                            configs.lessOptions.paths = [path.dirname(file)];
                            less.render(fileContent, configs.lessOptions, function(err, result) {
                                if (err) {
                                    console.log('less error:', err);
                                }
                                resolve({
                                    exists: true,
                                    content: err || result.css
                                });
                            });
                        } else if (ext == '.css') {
                            var fileContent = readFile(file);
                            resolve({
                                exists: true,
                                content: fileContent
                            });
                        }
                    }
                });
            });
        }
    };
});
//处理css文件
Processor.add('css', function() {
    //另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
    //https://github.com/Automattic/xgettext-js
    //处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
    var cssTmplReg = /(['"]?)\(?(global|ref|names)?@([\w\.\-\/\\]+?)(\.css|\.less|\.scss)(?:\[([\w-,]+)\]|:([\w\-]+))?\)?\1(;?)/g;
    var processCSS = function(e) {
        var cssNamesMap = {};
        var gCSSNamesMap = {};
        var cssNamesKey;
        var cssNameReg = /(?:@|global)?\.([\w\-]+)(?=[^\{\}]*?\{)/g;
        var addToGlobalCSS = true;
        var cssNamesCompress = {};
        var cssNamesCompressIdx = 0;
        //处理css类名
        var cssNameProcessor = function(m, name) {
            if (m.indexOf('global') === 0) return m.slice(6);
            if (m.charAt(0) == '@') return m.slice(1); //@.rule
            var mappedName = name;
            if (configs.compressCssSelectorNames) { //压缩，我们采用数字递增处理
                if (cssNamesCompress[name]) mappedName = cssNamesCompress[name];
                else mappedName = cssNamesCompress[name] = (cssNamesCompressIdx++).toString(32);
            }
            //只在原来的css类名前面加前缀
            var result = '.' + (cssNamesMap[name] = cssNamesKey + '-' + mappedName);
            if (addToGlobalCSS) { //是否增加到当前模块的全局css里，因为一个view.js可以依赖多个css文件
                gCSSNamesMap[name] = cssNamesMap[name];
            }
            return result;
        };
        var cssContentCache = {};
        return new Promise(function(resolve) {
            if (cssTmplReg.test(e.content)) { //有需要处理的@规则
                var count = 0;
                var resume = function() {
                    e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name, ext, keys, key, tail) {
                        name = resolveAtName(name, e.moduleId);
                        var file = path.resolve(path.dirname(e.from) + sep + name + ext);
                        var r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) return q + 'unfound:' + name + ext + q;
                        var fileContent = r.css;
                        //获取模块的id
                        var cssId = extractModuleId(file);
                        //css前缀是配置项中的前缀加上模块的md5信息
                        cssNamesKey = configs.cssSelectorPrefix + md5(cssId);
                        if (prefix != 'global') { //如果不是项目中全局使用的
                            addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                            cssNamesMap = {};
                            fileContent = fileContent.replace(cssNameReg, cssNameProcessor); //前缀处理
                            //@规则处理
                            fileContent = Processor.run('css:atrule', 'process', [fileContent, cssNamesKey]);
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
                            var c = cssNamesMap[key] || key;
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            replacement = '\'' + cssNamesKey + '\',' + JSON.stringify(fileContent);
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
                    name = resolveAtName(name, e.moduleId); //先处理名称
                    var file = path.resolve(path.dirname(e.from) + sep + name + ext);
                    if (!cssContentCache[file]) { //文件尚未读取
                        cssContentCache[file] = 1;
                        //调用 css 文件读取模块
                        Processor.run('css:read', 'process', [file]).then(function(info) {
                            //写入缓存，因为同一个view.js中可能对同一个css文件多次引用
                            cssContentCache[file] = {
                                exists: info.exists,
                                css: ''
                            };
                            if (info.exists && info.content) {
                                //css压缩
                                cssnano.process(info.content, configs.cssnanoOptions).then(function(r) {
                                    cssContentCache[file].css = r.css;
                                    go();
                                }, function(error) {
                                    console.log(file, error);
                                    go();
                                });
                            } else {
                                go();
                            }
                        });
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
    return {
        process: processCSS
    };
});
//模板文件，模板引擎命令处理，因为我们用的是字符串模板，常见的模板命令如<%=output%> {{output}}，这种通常会影响我们的分析，我们先把它们做替换处理
Processor.add('tmpl:cmd', function() {
    var anchor = '-\u001e';
    var tmplCommandAnchorCompressReg = /(\&\d+\-\u001e)\s+(?=[<>])/g;
    var tmplCommandAnchorCompressReg2 = /([<>])\s+(\&\d+\-\u001e)/g;
    var tmplCommandAnchorReg = /\&\d+\-\u001e/g;
    return {
        compress: function(content) { //对模板引擎命令的压缩，如<%if(){%><%}else{%><%}%>这种完全可以压缩成<%if(){}else{}%>，因为项目中模板引擎不固定，所以这个需要外部实现
            return configs.compressTmplCommand(content);
        },
        store: function(tmpl, store) { //保存模板引擎命令
            var idx = 0;
            if (configs.tmplCommand) {
                return tmpl.replace(configs.tmplCommand, function(match) {
                    if (!store[match]) {
                        store[match] = '&' + idx + anchor;
                        store['&' + idx + anchor] = match;
                        idx++;
                    }
                    return store[match];
                });
            }
            return tmpl;
        },
        tidy: function(tmpl) { //简单压缩
            tmpl = htmlminifier.minify(tmpl, configs.htmlminifierOptions);
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg, '$1');
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg2, '$1$2');
            return tmpl;
        },
        recover: function(tmpl, refTmplCommands) { //恢复替换的命令
            return tmpl.replace(tmplCommandAnchorReg, function(match) {
                var value = refTmplCommands[match];
                return value;
            });
        }
    };
});
//模板代码片断的处理，较少用
Processor.add('tmpl:snippet', function() {
    var snippetReg = /<snippet-(\w+)([^>]+)\/?>(?:<\/snippet-\1>)?/g;
    var attrsNameValueReg = /([^\s]+)=(["'])([\s\S]+?)\2/ig;
    return {
        expand: function(tmpl) {
            return tmpl.replace(snippetReg, function(match, name, attrs) {
                var props = {};
                attrs.replace(attrsNameValueReg, function(m, name, q, content) {
                    props[name] = content;
                });
                var html;
                if (configs.snippets.apply) {
                    html = configs.snippets(name, props);
                } else {
                    html = configs.snippets[name];
                }
                return html || '';
            });
        }
    };
});
//模板，增加guid标识，仅针对magix-updater使用：https://github.com/thx/magix-updater
Processor.add('tmpl:guid', function() {
    var tagReg = /<([\w]+)([^>]*?)mx-keys\s*=\s*"([^"]+)"([^>]*?)>/g;
    var holder = '-\u001f';
    var addGuid = function(tmpl, key, refGuidToKeys) {
        var g = 0;
        return tmpl.replace(tagReg, function(match, tag, preAttrs, keys, attrs, tKey) {
            g++;
            tKey = 'mx-guid="x' + key + g + holder + '"';
            refGuidToKeys[tKey] = keys;
            return '<' + tag + preAttrs + tKey + attrs + '>';
        });
    };
    return {
        add: addGuid
    };
});
//模板，处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理
Processor.add('tmpl:class', function() {
    var classReg = /class=(['"])([^'"]+)(?:\1)/g;
    var classNameReg = /(\s|^|\b)([\w\-]+)(?=\s|$|\b)/g;
    var pureTagReg = /<\w+[^>]*>/g;
    return {
        process: function(tmpl, cssNamesMap) {
            if (cssNamesMap) {
                //为了保证安全，我们一层层进入
                tmpl = tmpl.replace(pureTagReg, function(match) { //保证是标签
                    return match.replace(classReg, function(m, q, c) { //保证是class属性
                        return 'class=' + q + c.replace(classNameReg, function(m, h, n) {
                            return h + (cssNamesMap[n] ? cssNamesMap[n] : n);
                        }) + q;
                    });
                });
            }
            return tmpl;
        }
    };
});
//模板，子模板的处理，仍然是配合magix-updater：https://github.com/thx/magix-updater
Processor.add('tmpl:partial', function() {
    //生成子模板匹配正则
    var subReg = (function() {
        var temp = '<([\\w]+)[^>]*?(mx-guid="x[^"]+")[^>]*?>(#)</\\1>';
        var start = 12; //嵌套12层在同一个view中也足够了
        while (start--) {
            temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
        }
        temp = temp.replace('#', '(?:[\\s\\S]*?)');
        return new RegExp(temp, 'ig');
    }());
    var holder = '-\u001f';
    //属性正则
    var attrsNameValueReg = /([^\s]+)=(["'])([\s\S]+?)\2/ig;
    //自闭合标签，需要开发者明确写上如 <input />，注意>前的/,不能是<img>
    var selfCloseTag = /<(\w+)\s+[^>]*?(mx-guid="x[^"]+")[^>]*?\/>/g;
    //标签
    var pureTagReg = /<(\w+)[^>]*>/g;
    //模板引擎命令被替换的占位符
    var tmplCommandAnchorReg = /\&\d+\-\u001e/g;
    var tmplCommandAnchorRegTest = /\&\d+\-\u001e/;
    //属性处理
    var attrProps = {
        'class': 'className',
        'value': 'value',
        'checked': 'checked',
        '@disabled': 'disabled',
        '@checked': 'checked',
        '@readonly': 'readonly'
    };
    //哪些标签需要修复属性，如div上写上readonly是不需要做处理的
    var fixedAttrPropsTags = {
        'input': 1,
        'select': 1,
        'textarea': 1
    };
    //恢复被替换的模板引擎命令
    var commandAnchorRecover = function(tmpl, refTmplCommands) {
        return Processor.run('tmpl:cmd', 'recover', [tmpl, refTmplCommands]);
    };
    //添加属性信息
    var addAttrs = function(tag, tmpl, info, keysReg, refTmplCommands) {
        var attrsKeys = {},
            tmplKeys = {};
        //处理属性
        tmpl.replace(attrsNameValueReg, function(match, name, quote, content) {
            var findUserMxKey = false,
                aInfo;
            //如果是mx-view属性
            if (name == 'mx-view') {
                //设置view信息
                info.view = commandAnchorRecover(content, refTmplCommands);
            }
            if (tmplCommandAnchorRegTest.test(content)) {
                //有模板引擎命令
                /*
                    <div mx-keys="a,b,c" data-a="<%=a%>">
                        <%=b%>-<%=c%>
                    </div>
                    考虑这样的结构，当a变化时，我们只需要更新属性，b或c有变化时更新div的内容
                    也有这样的情况
                    <div mx-keys="a,b,c" data-a="<%=a%>">
                        <%=b%>-<%=c%>-<%=a%>
                    </div>
                    a变化时即要更新属性也要更新内容，下面的代码就是精确识别这种情形以达到最优的更新性能
                 */
                content = content.replace(tmplCommandAnchorReg, function(match) {
                    var value = refTmplCommands[match]; //获取原始命令
                    if (!findUserMxKey) {
                        for (var i = 0; i < keysReg.length; i++) { //查找用户给出的mx-keys是否在模板命令里，这块是性能优化用的
                            if (keysReg[i].test(value)) {
                                findUserMxKey = true;
                                break;
                            }
                        }
                    }
                    if (findUserMxKey) {
                        var words = value.match(/\w+/g); //获取模板命令中的单词
                        if (words) {
                            for (var i = words.length - 1; i >= 0; i--) {
                                attrsKeys[words[i]] = 1;
                            }
                        }
                    }
                    return value;
                });
                if (findUserMxKey) {
                    var key = attrProps[name]; //属性
                    aInfo = {
                        n: key || name,
                        v: content
                    };
                    //需要特殊处理的
                    if (key && fixedAttrPropsTags[tag] == 1 || name == 'class') {
                        aInfo.p = 1;
                    }
                    //如果属性是以@开头的，我们调用外部的处理器处理
                    if (name.charAt(0) == '@') { //添加到tmplData中，对原有的模板不修改
                        aInfo.v = configs.atAttrProcessor(name.slice(1), aInfo.v, {
                            tag: tag,
                            prop: aInfo.p,
                            partial: true
                        });
                    }
                    if (name != 'mx-view') { //如果不是mx-view属性则加入到属性列表中，mx-view会特殊处理
                        info.attrs.push(aInfo);
                    }
                }
            }
        });
        if (info.tmpl && info.attrs.length) { //有模板及属性
            //接下来我们处理前面的属性和内容更新问题
            info.tmpl.replace(tmplCommandAnchorReg, function(match) {
                var value = refTmplCommands[match];
                var words = value.match(/\w+/g);
                if (words) {
                    for (var i = words.length - 1; i >= 0; i--) {
                        tmplKeys[words[i]] = 1;
                    }
                }
            });
            var mask = '';
            for (var i = 0, m; i < info.keys.length; i++) {
                m = 0;
                //如果key存在内容模板中，则m为1
                if (tmplKeys[info.keys[i]]) m = 1;
                //如果key存在属性中,则m为2或者或上1
                if (attrsKeys[info.keys[i]]) m = m ? m | 2 : 2;
                mask += m + '';
            }
            //最后产出的结果可能如：
            /*
                {
                    keys:['a','b','c'],
                    mask:'211' //a对应2,b,c对应1，则表示a变化时，只更新属性,b,c变化时只更新节点内容
                }
             */
            if (/[12]/.test(mask))
                info.mask = mask;
        }
    };
    //展开@属性，主要是模板命令恢复及调用外部处理器
    var expandAtAttr = function(tmpl, refTmplCommands) {
        return tmpl.replace(pureTagReg, function(match, tag) {
            return match.replace(attrsNameValueReg, function(match, name, quote, content) {
                if (name.charAt(0) == '@') {
                    content = commandAnchorRecover(content, refTmplCommands);
                    match = configs.atAttrProcessor(name.slice(1), content, {
                        tag: tag,
                        prop: attrProps[name] && fixedAttrPropsTags[tag]
                    });
                }
                return match;
            });
        });
    };
    //递归构建子模板
    var buildTmpl = function(tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, parentOwnKeys, globalKeys) {
        if (!list) {
            list = [];
            g = 0;
            globalKeys = {};
        }
        var subs = [];
        //子模板
        tmpl = tmpl.replace(subReg, function(match, tag, guid, content) { //清除子模板后
            var ownKeys = {};
            for (var p in parentOwnKeys) {
                ownKeys[p] = parentOwnKeys[p];
            }
            var tmplInfo = {
                guid: ++g,
                keys: [],
                tmpl: content,
                selector: tag + '[' + guid + ']',
                attrs: []
            };
            var keysReg = [];
            if (parentOwnKeys) {
                tmplInfo.pKeys = Object.keys(parentOwnKeys);
            }
            var datakey = refGuidToKeys[guid];
            var keys = datakey.split(',');
            for (var i = 0, key; i < keys.length; i++) {
                key = keys[i].trim();
                tmplInfo.keys.push(key);
                ownKeys[key] = 1;
                globalKeys[key] = 1;
                keysReg.push(new RegExp('\\b' + key + '\\b'));
            }
            list.push(tmplInfo);
            var remain;
            if (tag == 'textarea') { //textarea特殊处理，因为textarea可以有节点内容
                addAttrs(tag, remain = match, tmplInfo, keysReg, refTmplCommands);
                tmplInfo.attrs.push({
                    n: 'value',
                    v: commandAnchorRecover(tmplInfo.tmpl, refTmplCommands),
                    p: 1
                });
                delete tmplInfo.guid;
                delete tmplInfo.tmpl;
                delete tmplInfo.mask;
            } else {
                if (tmplCommandAnchorRegTest.test(content)) { //内容中有模板
                    remain = match.replace(content, '@' + g + holder);
                    subs.push({
                        tmpl: content,
                        ownKeys: ownKeys,
                        tmplInfo: tmplInfo
                    });
                } else { //只处理属性
                    remain = match;
                    content = '';
                    delete tmplInfo.tmpl;
                    delete tmplInfo.guid;
                }
                addAttrs(tag, remain, tmplInfo, keysReg, refTmplCommands);
                if (!tmplInfo.attrs.length) { //没有属性
                    delete tmplInfo.attrs;
                }
                if (!tmplInfo.view && !tmplInfo.tmpl && !tmplInfo.attrs) { //即没模板也没属性，则删除
                    list.pop();
                }
            }
            return remain;
        });
        //自闭合
        tmpl.replace(selfCloseTag, function(match, tag, guid) {
            var tmplInfo = {
                keys: [],
                selector: tag + '[' + guid + ']',
                attrs: []
            };
            var keysReg = [];
            var datakey = refGuidToKeys[guid];
            var keys = datakey.split(',');
            for (var i = 0, key; i < keys.length; i++) {
                key = keys[i].trim();
                tmplInfo.keys.push(key);
                keysReg.push(new RegExp('\\b' + key + '\\b'));
            }
            list.push(tmplInfo);
            addAttrs(tag, match, tmplInfo, keysReg, refTmplCommands);
            if (!tmplInfo.attrs.length) {
                delete tmplInfo.attrs;
            }
        });
        tmpl = expandAtAttr(tmpl, refTmplCommands);
        while (subs.length) {
            var sub = subs.shift();
            var i = buildTmpl(sub.tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, sub.ownKeys, globalKeys);
            sub.tmplInfo.tmpl = i.tmpl;
        }
        tmpl = Processor.run('tmpl:class', 'process', [tmpl, cssNamesMap]);
        tmpl = commandAnchorRecover(tmpl, refTmplCommands);
        return {
            list: list,
            tmpl: tmpl,
            keys: globalKeys
        };
    };
    return {
        process: buildTmpl
    };
});
//模板中事件的提取，主要为brix-event模块提供：https://github.com/thx/brix-event/blob/master/src/brix/event.js#L15
Processor.add('tmpl:event', function() {
    var pureTagReg = /<\w+[^>]*>/g;
    var attrsNameValueReg = /([^\s]+)=(["'])[\s\S]+?\2/ig;
    var eventReg = /mx-(?!view|vframe|keys|options|data)[a-zA-Z]+/;
    return {
        extract: function(tmpl) {
            var map = {};
            tmpl.replace(pureTagReg, function(match) {
                match.replace(attrsNameValueReg, function(m, key) {
                    if (eventReg.test(key)) {
                        map[key.slice(3)] = 1;
                    }
                });
            });
            return Object.keys(map);
        }
    };
});
//模板处理，即处理view.html文件
Processor.add('tmpl', function() {
    var fileTmplReg = /(\btmpl\s*:\s*)??(['"])@([^'"]+)\.html(:data|:keys|:events)?(?:\2)/g;
    var htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
    var processTmpl = function(e) {
        return new Promise(function(resolve) {
            var cssNamesMap = e.cssNamesMap,
                from = e.from,
                moduleId = e.moduleId;
            //仍然是读取view.js文件内容，把里面@到的文件内容读取进来
            e.content = e.content.replace(fileTmplReg, function(match, prefix, quote, name, ext) {
                name = resolveAtName(name, moduleId);
                var file = path.resolve(path.dirname(from) + sep + name + '.html');
                var fileContent = name;
                if (fs.existsSync(file)) {
                    fileContent = readFile(file);
                    fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
                    if (ext == ':events') { //事件
                        var refTmplEvents = Processor.run('tmpl:event', 'extract', [fileContent]);
                        return JSON.stringify(refTmplEvents);
                    }
                    var guid = md5(from);
                    var refGuidToKeys = {},
                        refTmplCommands = {};
                    fileContent = Processor.run('tmpl:cmd', 'compress', [fileContent]);
                    fileContent = Processor.run('tmpl:snippet', 'expand', [fileContent]);
                    fileContent = Processor.run('tmpl:cmd', 'store', [fileContent, refTmplCommands]); //模板命令移除，防止影响分析

                    //console.log(refTmplEvents);
                    fileContent = Processor.run('tmpl:cmd', 'tidy', [fileContent]);
                    fileContent = Processor.run('tmpl:guid', 'add', [fileContent, guid, refGuidToKeys]);
                    //fileContent = Processor.run('tmpl:class', 'process', [fileContent, cssNamesMap]);

                    //fileContent = Processor.run('tmpl:cmd', 'recover', [fileContent, refTmplCommands]);
                    var info = Processor.run('tmpl:partial', 'process', [fileContent, refGuidToKeys, refTmplCommands, cssNamesMap]);
                    if (ext == ':data') {
                        return JSON.stringify(info.list);
                    } else if (ext == ':keys') {
                        return JSON.stringify(info.keys);
                    } else {
                        if (prefix && configs.outputTmplObject) {
                            return prefix + JSON.stringify({
                                html: info.tmpl,
                                subs: info.list
                            });
                        }
                        return (prefix ? prefix : '') + JSON.stringify(info.tmpl);
                    }
                }
                return quote + 'unfound:' + name + quote;
            });
            resolve(e);
        });
    };
    return {
        process: processTmpl
    };
});
//用的seajs的
Processor.add('require:parser', function() {
    /**
     * util-deps.js - The parser for dependencies
     * ref: tests/research/parse-dependencies/test.html
     * ref: https://github.com/seajs/crequire
     */

    function parseDependencies(s) {
        if (s.indexOf('require') == -1) {
            return [];
        }
        var index = 0,
            peek, length = s.length,
            isReg = 1,
            modName = 0,
            res = [];
        var parentheseState = 0,
            parentheseStack = [];
        var braceState, braceStack = [],
            isReturn;
        while (index < length) {
            readch();
            if (isBlank()) {
                if (isReturn && (peek == '\n' || peek == '\r')) {
                    braceState = 0;
                    isReturn = 0;
                }
            } else if (isQuote()) {
                dealQuote();
                isReg = 1;
                isReturn = 0;
                braceState = 0;
            } else if (peek == '/') {
                readch();
                if (peek == '/') {
                    index = s.indexOf('\n', index);
                    if (index == -1) {
                        index = s.length;
                    }
                } else if (peek == '*') {
                    var i = s.indexOf('\n', index);
                    index = s.indexOf('*/', index);
                    if (index == -1) {
                        index = length;
                    } else {
                        index += 2;
                    }
                    if (isReturn && i != -1 && i < index) {
                        braceState = 0;
                        isReturn = 0;
                    }
                } else if (isReg) {
                    dealReg();
                    isReg = 0;
                    isReturn = 0;
                    braceState = 0;
                } else {
                    index--;
                    isReg = 1;
                    isReturn = 0;
                    braceState = 1;
                }
            } else if (isWord()) {
                dealWord();
            } else if (isNumber()) {
                dealNumber();
                isReturn = 0;
                braceState = 0;
            } else if (peek == '(') {
                parentheseStack.push(parentheseState);
                isReg = 1;
                isReturn = 0;
                braceState = 1;
            } else if (peek == ')') {
                isReg = parentheseStack.pop();
                isReturn = 0;
                braceState = 0;
            } else if (peek == '{') {
                if (isReturn) {
                    braceState = 1;
                }
                braceStack.push(braceState);
                isReturn = 0;
                isReg = 1;
            } else if (peek == '}') {
                braceState = braceStack.pop();
                isReg = !braceState;
                isReturn = 0;
            } else {
                var next = s.charAt(index);
                if (peek == ';') {
                    braceState = 0;
                } else if (peek == '-' && next == '-' || peek == '+' && next == '+' || peek == '=' && next == '>') {
                    braceState = 0;
                    index++;
                } else {
                    braceState = 1;
                }
                isReg = peek != ']';
                isReturn = 0;
            }
        }
        return res;

        function readch() {
            peek = s.charAt(index++);
        }

        function isBlank() {
            return /\s/.test(peek);
        }

        function isQuote() {
            return peek == '"' || peek == "'";
        }

        function dealQuote() {
            var start = index;
            var c = peek;
            var end = s.indexOf(c, start);
            if (end == -1) {
                index = length;
            } else if (s.charAt(end - 1) != '\\') {
                index = end + 1;
            } else {
                while (index < length) {
                    readch();
                    if (peek == '\\') {
                        index++;
                    } else if (peek == c) {
                        break;
                    }
                }
            }
            if (modName) {
                //maybe substring is faster  than slice .
                //res.push(s.substring(start, index - 1));
                res.push({
                    name: s.substring(start, index - 1),
                    start: start
                });
                modName = 0;
            }
        }

        function dealReg() {
            index--;
            while (index < length) {
                readch();
                if (peek == '\\') {
                    index++;
                } else if (peek == '/') {
                    break;
                } else if (peek == '[') {
                    while (index < length) {
                        readch();
                        if (peek == '\\') {
                            index++;
                        } else if (peek == ']') {
                            break;
                        }
                    }
                }
            }
        }

        function isWord() {
            return /[a-z_$]/i.test(peek);
        }

        function dealWord() {
            var s2 = s.slice(index - 1);
            var r = /^[\w$]+/.exec(s2)[0];
            parentheseState = {
                'if': 1,
                'for': 1,
                'while': 1,
                'with': 1
            }[r];
            isReg = {
                'break': 1,
                'case': 1,
                'continue': 1,
                'debugger': 1,
                'delete': 1,
                'do': 1,
                'else': 1,
                'false': 1,
                'if': 1,
                'in': 1,
                'instanceof': 1,
                'return': 1,
                'typeof': 1,
                'void': 1
            }[r];
            isReturn = r == 'return';
            braceState = {
                'instanceof': 1,
                'delete': 1,
                'void': 1,
                'typeof': 1,
                'return': 1
            }.hasOwnProperty(r);
            modName = /^require\s*(?:\/\*[\s\S]*?\*\/\s*)?\(\s*(['"]).+?\1\s*[),]/.test(s2);
            if (modName) {
                r = /^require\s*(?:\/\*[\s\S]*?\*\/\s*)?\(\s*['"]/.exec(s2)[0];
                index += r.length - 2;
            } else {
                index += /^[\w$]+(?:\s*\.\s*[\w$]+)*/.exec(s2)[0].length - 1;
            }
        }

        function isNumber() {
            return /\d/.test(peek) || peek == '.' && /\d/.test(s.charAt(index));
        }

        function dealNumber() {
            var s2 = s.slice(index - 1);
            var r;
            if (peek == '.') {
                r = /^\.\d+(?:E[+-]?\d*)?\s*/i.exec(s2)[0];
            } else if (/^0x[\da-f]*/i.test(s2)) {
                r = /^0x[\da-f]*\s*/i.exec(s2)[0];
            } else {
                r = /^\d+\.?\d*(?:E[+-]?\d*)?\s*/i.exec(s2)[0];
            }
            index += r.length - 1;
            isReg = 0;
        }
    }

    return {
        process: parseDependencies
    };
});
//分析js中的require命令
Processor.add('require', function() {
    var depsReg = /(?:var\s+([^=]+)=\s*)?\brequire\s*\(([^\(\)]+)\);?/g;
    //var exportsReg = /module\.exports\s*=\s*/;
    var anchor = '\u0011';
    var anchorReg = /(['"])\u0011([^'"]+)\1/;
    return {
        process: function(e) {
            var deps = [];
            var vars = [];
            var noKeyDeps = [];
            //var hasExports;
            var moduleId = extractModuleId(e.from);
            // if (exportsReg.test(e.content)) {
            //     e.content = e.content.replace(exportsReg, 'return ');
            //     hasExports = true;
            // }
            var depsInfo = Processor.run('require:parser', 'process', [e.content]);
            for (var i = 0, start; i < depsInfo.length; i++) {
                start = depsInfo[i].start + i;
                e.content = e.content.substring(0, start) + anchor + e.content.substring(start);
            }
            e.content = e.content.replace(depsReg, function(match, key, str) {
                var info = str.match(anchorReg);
                if (!info) return match;
                str = info[1] + info[2] + info[1];
                str = resolveAtPath(str, moduleId);
                if (key) {
                    vars.push(key);
                    deps.push(str);
                } else {
                    noKeyDeps.push(str);
                }
                return configs.loaderType == 'cmd' ? match.replace(anchor, '') : '';
            });
            deps = deps.concat(noKeyDeps);
            e.moduleId = moduleId;
            e.deps = deps;
            e.vars = vars;
            e.requires = deps;
            //e.hasxports = hasExports;
            return Promise.resolve(e);
        }
    };
});
//增加loader
Processor.add('file:loader', function() {
    var tmpls = {
        cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
        cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
        amd: 'define(\'${moduleId}\',[${requires}],function(${vars}){${content}\r\n});',
        amd1: 'define(\'${moduleId}\',[],function(){\r\n${content}\r\n});'
    };
    var moduleExportsReg = /\bmodule\.exports\s*=\s*/;
    var amdDefineReg = /\bdefine\.amd\b/;
    return {
        process: function(e) {
            var key = configs.loaderType + (e.requires.length ? '' : '1');
            var tmpl = tmpls[key];
            for (var p in e) {
                var reg = new RegExp('\\$\\{' + p + '\\}', 'g');
                tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
            }
            if (configs.loaderType == 'amd' && !amdDefineReg.test(tmpl)) {
                tmpl = tmpl.replace(moduleExportsReg, 'return ');
            }
            return tmpl;
        }
    };
});
//文件内容处理，主要是把各个处理模块串起来
Processor.add('file:content', function() {
    var moduleIdReg = /(['"])(@moduleId)\1/g;
    return {
        process: function(from, to, content) {
            if (!content) content = readFile(from);
            return Processor.run('require', 'process', [{
                from: from,
                content: content
                    }]).then(function(e) {
                e.to = to;
                return Processor.run('css', 'process', [e]);
            }).then(function(e) {
                return Processor.run('tmpl', 'process', [e]);
            }).then(function(e) {
                //e.content = Processor.run('comment', 'restore', [e.content, store]);
                e.content = e.content.replace(moduleIdReg, '$1' + e.moduleId + '$1');
                e.content = resolveAtPath(e.content, e.moduleId);
                var tmpl = Processor.run('file:loader', 'process', [e]);
                return Promise.resolve(tmpl);
            }).catch(function(e) {
                console.log(e);
            });
        }
    };
});
//文件处理
Processor.add('file', function() {
    var extnames = {
        '.html': 1,
        '.css': 1,
        '.less': 1,
        '.scss': 1
    };
    var processFile = function(from, to, inwatch) { // d:\a\b.js  d:\c\d.js
        from = path.resolve(from);
        console.log('process:', from);
        to = path.resolve(to);
        for (var i = configs.excludeTmplFolders.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFolders[i]) >= 0) {
                return copyFile(from, to);
            }
        }
        if (jsReg.test(from)) {
            Processor.run('file:content', 'process', [from, to]).then(function(content) {
                writeFile(to, content);
            });
        } else {
            var extname = path.extname(from);
            if (!configs.onlyAllows || configs.onlyAllows[extname]) {
                if (inwatch && fileDependencies[from]) { //只更新依赖项
                    runFileDepend(from);
                    return;
                }
                if (extnames[extname] === 1) {
                    var name = path.basename(from, extname);
                    var ns = name.split('-');
                    var found;
                    while (ns.length) {
                        var tname = ns.join('-');
                        var jsf = path.dirname(from) + sep + tname + '.js';
                        ns.pop();
                        if (fs.existsSync(jsf)) {
                            found = true;
                            var aimFile = path.dirname(to) + sep + path.basename(jsf);
                            addFileDepend(from, jsf, aimFile);
                            if (inwatch) {
                                processFile(jsf, aimFile, inwatch);
                            }
                            configs.processAttachedFile(extname, from, to);
                            break;
                        }
                    }
                    if (!found) {
                        copyFile(from, to);
                    }
                } else {
                    copyFile(from, to);
                }
            }
        }
    };
    return {
        process: processFile
    };
});
module.exports = {
    walk: walk,
    copyFile: copyFile,
    addProcessor: Processor.add,
    removeFile: function(from) {
        removeFileDepend(from);
        var file = from.replace(configs.tmplReg, configs.srcHolder);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    },
    config: function(config) {
        for (var p in config) {
            configs[p] = config[p];
        }
        configs.excludeTmplFolders = configs.excludeTmplFolders.map(function(str) {
            return path.resolve(str);
        });
    },
    combine: function() {
        initFolder();
        walk(configs.tmplFolder, function(filepath) {
            var from = filepath;
            var to = from.replace(configs.tmplReg, configs.srcHolder);
            Processor.run('file', 'process', [from, to]);
        });
    },
    processFile: function(from) {
        initFolder();
        var to = from.replace(configs.tmplReg, configs.srcHolder);
        Processor.run('file', 'process', [from, to, true]);
    },
    processContent: function(from, to, content) {
        initFolder();
        return Processor.run('file:content', 'process', [from, to, content]);
    },
    build: function() {
        initFolder();
        walk(configs.srcFolder, function(p) {
            copyFile(p, p.replace(configs.srcReg, configs.buildHolder));
        });
    }
};