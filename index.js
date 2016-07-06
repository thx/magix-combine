var crypto = require('crypto');
var Buffer = require('buffer').Buffer;
var fs = require('fs');
var path = require('path');
var cssnano = require('cssnano');
var htmlminifier = require('html-minifier');
var sep = path.sep;
var sepRegTmpl = sep.replace(/\\/g, '\\\\');
var sepReg = new RegExp(sepRegTmpl, 'g');

var configs = {
    tmplFolder: 'tmpl',
    srcFolder: 'src',
    buildFolder: 'build',
    cssnanoOptions: {
        safe: true
    },
    prefix: '',
    htmlminifierOptions: {
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        //removeAttributeQuotes: true, //属性引号
        quoteCharacter: '"',
        keepClosingSlash: true //
    },
    excludeTmplFolders: [],
    snippets: {},
    compressCssNames: false,
    generateJSFile: function() {
        return '';
    },
    atAttrProcessor: function(name, tmpl) {
        return tmpl;
    },
    compressTmplCommand: function(tmpl) {
        return tmpl;
    }
};
var copyFile = function(from, to, callback) {
    if (fs.existsSync(from)) {
        var folders = path.dirname(to).split(sep);
        var p = '';
        while (folders.length) {
            p += folders.shift() + sep;
            if (!fs.existsSync(p)) {
                fs.mkdirSync(p);
            }
        }
        var content = readFile(from);
        if (callback) {
            callback(content).then(function(c) {
                fs.writeFileSync(to, c);
            });
        } else {
            fs.writeFileSync(to, content);
        }
    }
};
var walk = function(folder, callback) {
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
var md5Cache = {};
var md5ResultKey = '_$%';
var md5 = function(text) {
    if (md5Cache[text]) return md5Cache[text];
    var buf = new Buffer(text);
    var str = buf.toString('binary');
    str = crypto.createHash('md5').update(str).digest('hex');
    var c = 0;
    var rstr = str.substring(c, c + 3);
    while (md5Cache[md5ResultKey + rstr] == 1) { //不同的文件，但生成了相同的key
        c++;
        rstr = str.substring(c, c + 3);
    }
    md5Cache[text] = rstr;
    md5Cache[md5ResultKey + rstr] = 1;
    return rstr;
};
var fileCaches = {};
var readFile = function(file) {
    if (fileCaches.hasOwnProperty(file)) {
        return fileCaches[file];
    }
    var c = fs.readFileSync(file) + '';
    return (fileCaches[file] = c);
};
var relativePathReg = /(['"])@([^\/]+)(\S+?)(?=\\?\1)/g;
var resolveAtPath = function(content, from) {
    var folder = from.substring(0, from.lastIndexOf('/') + 1);
    var tp;
    return content.replace(relativePathReg, function(m, q, l, p) {
        if (l.charAt(0) == '.')
            tp = q + path.normalize(folder + l + p);
        else
            tp = q + path.relative(folder, l + p);
        tp = tp.replace(sepReg, '/');
        return tp;
    });
};
var resolveAtName = function(name, moduleId) {
    if (name.indexOf('/') >= 0 && name.charAt(0) != '.') {
        name = resolveAtPath('"@' + name + '"', moduleId).slice(1, -1);
    }
    return name;
};
var fileDependencies = {};
var addFileDepend = function(file, dependFrom, dependTo) {
    var list = fileDependencies[file];
    if (!list) {
        list = fileDependencies[file] = {};
    }
    list[dependFrom] = dependTo;
};
var runFileDepend = function(file) {
    var list = fileDependencies[file];
    if (list) {
        for (var p in list) {
            Processor.run('file', 'process', [p, list[p], true]);
        }
    }
};
var removeFileDepend = function(file) {
    delete fileCaches[file];
    delete fileDependencies[file];
};
var jsReg = /\.js$/i;
var startSlashReg = /^\//;
var extractModuleId = function(file) {
    return file.replace(configs.moduleIdRemovedPath, '')
        .replace(jsReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
};
var initFolder = function() {
    if (!configs.initedFolder) {
        configs.initedFolder = 1;
        configs.tmplFolder = path.resolve(configs.tmplFolder);
        configs.srcFolder = path.resolve(configs.srcFolder);
        configs.buildFolder = path.resolve(configs.buildFolder);

        var tmplFolderName = path.basename(configs.tmplFolder);
        var srcFolderName = path.basename(configs.srcFolder);
        var buildFolderName = path.basename(configs.buildFolder);
        configs.moduleIdRemovedPath = path.resolve(configs.tmplFolder);
        configs.tmplReg = new RegExp('(' + sepRegTmpl + '?)' + tmplFolderName + sepRegTmpl);
        configs.srcHolder = '$1' + srcFolderName + sep;
        configs.srcReg = new RegExp('(' + sepRegTmpl + '?)' + srcFolderName + sepRegTmpl);
        configs.buildHolder = '$1' + buildFolderName + sep;
    }
};
var processorMap = {};
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
Processor.add('css', function() {
    var cssTmplReg = /(['"])(global|ref|names)?@([^'"]+)\.css(?:\[([^\[\]]+)\]|:([^'"]+))?(?:\1)(;)?/g;
    var processAts = function(fileContent, cssNamesKey) {
        var cssAtNamesKeyReg = /(^|[\s\}])@([a-z\-]+)\s*([\w\-]+)?\{([^\{\}]*)\}/g;
        var cssKeyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+([\w\-]+)/g;
        var contents = [];
        fileContent = fileContent.replace(cssKeyframesReg, function(m, head, keyframe, name) {
            contents.push(name);
            return head + keyframe + ' ' + cssNamesKey + '-' + name;
        });
        fileContent = fileContent.replace(cssAtNamesKeyReg, function(match, head, key, name, content) {
            if (key == 'font-face') {
                var m = content.match(/font-family\s*:\s*(['"])?([\w\-]+)\1/);
                if (m) {
                    contents.push(m[2]);
                }
            }
            return match;
        });
        while (contents.length) {
            var t = contents.pop();
            var reg = new RegExp(':\\s*([\'"])?' + t.replace(/[\-#$\^*()+\[\]{}|\\,.?\s]/g, '\\$&') + '\\1', 'g');
            fileContent = fileContent.replace(reg, ':$1' + cssNamesKey + '-' + t + '$1');
        }
        return fileContent;
    };
    var processCSS = function(e) {
        var cssNamesMap = {};
        var gCSSNamesMap = {};
        var cssNamesKey;
        var cssNameReg = /@?\.([\w\-]+)(?=[^\{\}]*?\{)/g;
        var addToGlobalCSS = true;
        var cssNamesCompress = {};
        var cssNamesCompressIdx = 0;
        var cssNameProcessor = function(m, name) {
            if (m.charAt(0) == '@') return m.slice(1); //@.rule
            var mappedName = name;
            if (configs.compressCssNames) {
                if (cssNamesCompress[name]) mappedName = cssNamesCompress[name];
                else mappedName = cssNamesCompress[name] = (cssNamesCompressIdx++).toString(32);
            }
            var result = '.' + (cssNamesMap[name] = cssNamesKey + '-' + mappedName);
            if (addToGlobalCSS) {
                gCSSNamesMap[name] = cssNamesMap[name];
            }
            return result;
        };
        var cssContentCache = {};
        return new Promise(function(resolve) {
            if (cssTmplReg.test(e.content)) {
                var count = 0;
                var resume = function() {
                    e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name, keys, key, tail) {
                        name = resolveAtName(name, e.moduleId);
                        var file = path.resolve(path.dirname(e.from) + sep + name + '.css');
                        var r = cssContentCache[file];
                        var fileContent = r.css;
                        var cssId = extractModuleId(file);
                        cssNamesKey = configs.prefix + md5(cssId);
                        if (prefix != 'global') {
                            addToGlobalCSS = prefix != 'names';
                            cssNamesMap = {};
                            fileContent = fileContent.replace(cssNameReg, cssNameProcessor);
                            fileContent = processAts(fileContent, cssNamesKey);
                        }
                        var replacement;
                        if (prefix == 'names') {
                            if (keys) {
                                replacement = JSON.stringify(cssNamesMap, keys.split(','));
                            } else {
                                replacement = JSON.stringify(cssNamesMap);
                            }
                        } else if (prefix == 'ref') {
                            replacement = '';
                            tail = '';
                        } else if (key) {
                            var c = key == '$prefix' ? cssNamesKey + '-' : cssNamesMap[key];
                            replacement = q + c + q;
                        } else {
                            replacement = '\'' + cssNamesKey + '\',' + JSON.stringify(fileContent);
                        }
                        tail = tail ? tail : '';
                        return replacement + tail;
                    });
                    e.cssNamesMap = gCSSNamesMap;
                    resolve(e);
                };
                e.content = e.content.replace(cssTmplReg, function(m, q, prefix, name) {
                    count++;
                    name = resolveAtName(name, e.moduleId);
                    var file = path.resolve(path.dirname(e.from) + sep + name + '.css');
                    if (fs.existsSync(file)) {
                        addFileDepend(file, e.from, e.to);
                        if (!cssContentCache[file]) {
                            var fileContent = readFile(file);
                            cssContentCache[file] = 1;
                            cssnano.process(fileContent, configs.nanoOptions).then(function(r) {
                                cssContentCache[file] = r;
                                count--;
                                if (!count) {
                                    resume();
                                }
                            }, function(error) {
                                console.log(file, error);
                                count--;
                                if (!count) {
                                    resume();
                                }
                            });
                        } else {
                            count--;
                        }
                        return m;
                    } else {
                        count--;
                        return '\'unfound:' + name + '.css\'';
                    }
                });
                if (!count) {
                    resume();
                }
            } else {
                resolve(e);
            }
        });
    };
    return {
        process: processCSS
    };
});
Processor.add('tmpl:cmd', function() {
    var anchor = '-\u001e';
    var tmplCommandAnchorCompressReg = /(\&\d+\-\u001e)\s+(?=[<>])/g;
    var tmplCommandAnchorCompressReg2 = /([<>])\s+(\&\d+\-\u001e)/g;
    var tmplCommandAnchorReg = /\&\d+\-\u001e/g;
    return {
        compress: function(content) {
            return configs.compressTmplCommand(content);
        },
        store: function(tmpl, store) {
            var idx = 0;
            return tmpl.replace(configs.tmplCommand, function(match) {
                if (!store[match]) {
                    store[match] = '&' + idx + anchor;
                    store['&' + idx + anchor] = match;
                    idx++;
                }
                return store[match];
            });
        },
        tidy: function(tmpl) {
            tmpl = htmlminifier.minify(tmpl, configs.htmlminifierOptions);
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg, '$1');
            tmpl = tmpl.replace(tmplCommandAnchorCompressReg2, '$1$2');
            return tmpl;
        },
        recover: function(tmpl, refTmplCommands) {
            return tmpl.replace(tmplCommandAnchorReg, function(match) {
                var value = refTmplCommands[match];
                return value;
            });
        }
    };
});
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
Processor.add('tmpl:class', function() {
    var classReg = /class=(['"])([^'"]+)(?:\1)/g;
    var classNameReg = /(\s|^|\b)([\w\-]+)(?=\s|$|\b)/g;
    var pureTagReg = /<\w+[^>]*>/g;
    return {
        process: function(tmpl, cssNamesMap) {
            if (cssNamesMap) {
                tmpl = tmpl.replace(pureTagReg, function(match) {
                    return match.replace(classReg, function(m, q, c) {
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
Processor.add('tmpl:partial', function() {
    var subReg = (function() {
        var temp = '<([\\w]+)[^>]*?(mx-guid="x[^"]+")[^>]*?>(#)</\\1>';
        var start = 12;
        while (start--) {
            temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
        }
        temp = temp.replace('#', '(?:[\\s\\S]*?)');
        return new RegExp(temp, 'ig');
    }());
    var holder = '-\u001f';
    var attrsNameValueReg = /([^\s]+)=(["'])([\s\S]+?)\2/ig;
    var selfCloseTag = /<(\w+)\s+[^>]*?(mx-guid="x[^"]+")[^>]*?\/>/g;
    var pureTagReg = /<(\w+)[^>]*>/g;
    var tmplCommandAnchorReg = /\&\d+\-\u001e/g;
    var tmplCommandAnchorRegTest = /\&\d+\-\u001e/;
    var attrProps = {
        'class': 'className',
        'value': 'value',
        'checked': 'checked',
        '@disabled': 'disabled',
        '@checked': 'checked',
        '@readonly': 'readonly'
    };
    var fixedAttrPropsTags = {
        'input': 1,
        'select': 1,
        'textarea': 1
    };

    var commandAnchorRecover = function(tmpl, refTmplCommands) {
        return Processor.run('tmpl:cmd', 'recover', [tmpl, refTmplCommands]);
    };
    var addAttrs = function(tag, tmpl, info, keysReg, refTmplCommands) {
        var attrsKeys = {},
            tmplKeys = {},
            viewContent;
        tmpl.replace(attrsNameValueReg, function(match, name, quote, content) {
            var hasKey = false,
                aInfo;
            if (name == 'mx-view') {
                viewContent = content;
            }
            if (tmplCommandAnchorRegTest.test(content)) {
                content = content.replace(tmplCommandAnchorReg, function(match) {
                    var value = refTmplCommands[match];
                    if (!hasKey) {
                        for (var i = 0; i < keysReg.length; i++) {
                            if (keysReg[i].test(value)) {
                                hasKey = true;
                                break;
                            }
                        }
                    }
                    if (hasKey) {
                        var words = value.match(/\w+/g);
                        if (words) {
                            for (var i = words.length - 1; i >= 0; i--) {
                                attrsKeys[words[i]] = 1;
                            }
                        }
                    }
                    return value;
                });
                if (hasKey) {
                    var key = attrProps[name];
                    aInfo = {
                        n: key || name,
                        v: content
                    };
                    if (key && fixedAttrPropsTags[tag] == 1 || name == 'class') {
                        aInfo.p = 1;
                    }
                    if (name.charAt(0) == '@') { //添加到tmplData中，对原有的模板不修改
                        aInfo.v = configs.atAttrProcessor(name.slice(1), aInfo.v, {
                            tag: tag,
                            prop: aInfo.p,
                            partial: true
                        });
                    }
                    if (name == 'mx-view') {
                        viewContent = aInfo.v;
                    }
                    if (name != 'mx-view') {
                        info.attrs.push(aInfo);
                    }
                    if (viewContent) {
                        info.view = viewContent;
                    }
                }
            }
        });
        if (info.tmpl && info.attrs.length) {
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
                if (tmplKeys[info.keys[i]]) m = 1;
                if (attrsKeys[info.keys[i]]) m = m ? m | 2 : 2;
                mask += m + '';
            }
            if (/[12]/.test(mask))
                info.mask = mask;
        }
    };
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

    var buildTmpl = function(tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, parentOwnKeys) {
        if (!list) {
            list = [];
            g = 0;
        }
        var subs = [];
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
                keysReg.push(new RegExp('\\b' + key + '\\b'));
            }
            list.push(tmplInfo);
            var remain;
            if (tag == 'textarea') {
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
                if (!tmpl.view && !tmplInfo.tmpl && !tmplInfo.attrs) { //即没模板也没属性，则删除
                    list.pop();
                }
            }
            return remain;
        });
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
            var i = buildTmpl(sub.tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, sub.ownKeys);
            sub.tmplInfo.tmpl = i.tmpl;
        }
        tmpl = Processor.run('tmpl:class', 'process', [tmpl, cssNamesMap]);
        tmpl = commandAnchorRecover(tmpl, refTmplCommands);
        return {
            list: list,
            tmpl: tmpl
        };
    };
    return {
        process: buildTmpl
    };
});
Processor.add('tmpl:event', function() {
    var pureTagReg = /<\w+[^>]*>/g;
    var attrsNameValueReg = /([^\s]+)=(["'])[\s\S]+?\2/ig;
    var eventReg = /mx-(?!view|vframe)[a-zA-Z]+/;
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

Processor.add('tmpl', function() {
    var fileTmplReg = /(['"])@([^'"]+)\.html(:data)?(?:\1)/g;
    var htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
    var processTmpl = function(e) {
        return new Promise(function(resolve) {
            var cssNamesMap = e.cssNamesMap,
                from = e.from,
                moduleId = e.moduleId;
            e.content = e.content.replace(fileTmplReg, function(match, quote, name, isData) {
                name = resolveAtName(name, moduleId);
                var file = path.resolve(path.dirname(from) + sep + name + '.html');
                var fileContent = name;
                if (fs.existsSync(file)) {
                    fileContent = readFile(file);
                    fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
                    var guid = md5(from);
                    var refGuidToKeys = {},
                        refTmplCommands = {};
                    fileContent = Processor.run('tmpl:cmd', 'compress', [fileContent]);
                    fileContent = Processor.run('tmpl:snippet', 'expand', [fileContent]);
                    fileContent = Processor.run('tmpl:cmd', 'store', [fileContent, refTmplCommands]); //模板命令移除，防止影响分析
                    //var refTmplEvents = Processor.run('tmpl:event', 'extract', [fileContent]);
                    //console.log(refTmplEvents);
                    fileContent = Processor.run('tmpl:cmd', 'tidy', [fileContent]);
                    fileContent = Processor.run('tmpl:guid', 'add', [fileContent, guid, refGuidToKeys]);
                    //fileContent = Processor.run('tmpl:class', 'process', [fileContent, cssNamesMap]);

                    //fileContent = Processor.run('tmpl:cmd', 'recover', [fileContent, refTmplCommands]);
                    var info = Processor.run('tmpl:partial', 'process', [fileContent, refGuidToKeys, refTmplCommands, cssNamesMap]);
                    if (isData) {
                        return JSON.stringify(info.list);
                    } else {
                        return JSON.stringify(info.tmpl);
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
Processor.add('require', function() {
    var depsReg = /(?:var\s+([^=]+)=\s*)?\brequire\s*\(([^\(\)]+)\);?/g;
    var exportsReg = /module\.exports\s*=\s*/;
    var anchor = '\u0011';
    var anchorReg = /(['"])\u0011([^'"]+)\1/;
    return {
        process: function(e) {
            var deps = [];
            var vars = [];
            var noKeyDeps = [];
            var hasExports;
            var moduleId = extractModuleId(e.from);
            if (exportsReg.test(e.content)) {
                e.content = e.content.replace(exportsReg, 'return ');
                hasExports = true;
            }
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
                return configs.removeRequire ? '' : match.replace(anchor, '');
            });
            deps = deps.concat(noKeyDeps);
            e.moduleId = moduleId;
            e.deps = deps;
            e.vars = vars;
            e.requires = deps;
            e.hasxports = hasExports;
            return Promise.resolve(e);
        }
    };
});

// Processor.add('comment', function() {
//     var anchor = '~\u0011';
//     var comment = /("(?:[^\\"]*(?:\\.)?)*")|('(?:[^\\']*(?:\\.)?)*')|(\/{2,}.*?[\r\n])|(\/\*(?:\n|\r|.)*?\*\/)/g;
//     var lineCommentStart = /^\/{2,}/;
//     var mlCommentStart = /^\/\*/;
//     var key = /\~\u0011\d+/g;
//     return {
//         remove: function(content, store) {
//             var idx = 0;
//             return content.replace(comment, function(m) {
//                 if (lineCommentStart.test(m) || mlCommentStart.test(m)) {
//                     var key = anchor + idx++;
//                     store[key] = m;
//                     return key;
//                 }
//                 return m;
//             });
//         },
//         restore: function(content, store) {
//             return content.replace(key, function(m) {
//                 return store[m];
//             });
//         }
//     };
// });
Processor.add('file', function() {
    var moduleIdReg = /(['"])(@moduleId)\1/g;
    var extnames = {
        '.html': 1,
        '.css': 1
    };
    var processFile = function(from, to, inwatch) { // d:\a\b.js  d:\c\d.js
        from = path.resolve(from);
        console.log('process:', from);
        to = path.resolve(to);
        delete fileCaches[from];
        for (var i = configs.excludeTmplFolders.length - 1; i >= 0; i--) {
            if (from.indexOf(configs.excludeTmplFolders[i]) >= 0) {
                return copyFile(from, to);
            }
        }
        if (jsReg.test(from)) {
            copyFile(from, to, function(content) {
                //var store = {};
                //content = Processor.run('comment', 'remove', [content, store]);
                return new Promise(function(resolve) {
                    Processor.run('require', 'process', [{
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
                        var tmpl = configs.generateJSFile(e);
                        resolve(tmpl);
                    }).catch(function(e) {
                        console.log(e);
                    });
                });
            });
        } else {
            var extname = path.extname(from);
            if (configs.onlyAllows[extname]) {
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
    build: function() {
        initFolder();
        walk(configs.srcFolder, function(p) {
            copyFile(p, p.replace(configs.srcReg, configs.buildHolder));
        });
    }
};