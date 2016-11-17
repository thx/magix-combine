var path = require('path');
var fs = require('fs');
var fd = require('./util-fd');
var atpath = require('./util-atpath');
var md5 = require('./util-md5');
var configs = require('./util-config');
var tmplEvent = require('./tmpl-event');
var tmplCmd = require('./tmpl-cmd');
var tmplMxTag = require('./tmpl-mxtag');
var tmplGuid = require('./tmpl-guid');
var tmplPartial = require('./tmpl-partial');
var tmplMxTmpl = require('./tmpl-mxtmpl');
var tmplImg = require('./tmpl-img');
//模板处理，即处理view.html文件
var fileTmplReg = /(\btmpl\s*:\s*)??(['"])@([^'"]+)\.html(:data|:keys|:events)?(?:\2)/g;
var htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
var sep = path.sep;
var processTmpl = function(from, fileContent, cache, cssNamesMap) {
    var fCache = cache[fileContent];
    if (!fCache) {
        var temp = {};
        cache[fileContent] = temp;
        fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
        var tmplEvents = tmplEvent.extract(fileContent);
        temp.events = JSON.stringify(tmplEvents);

        var guid = md5(from);
        var refGuidToKeys = {},
            refTmplCommands = {};
        fileContent = tmplMxTag.process(fileContent);
        fileContent = tmplImg.process(fileContent);
        if (configs.useMagixTmplAndUpdater) {
            fileContent = tmplMxTmpl.process(fileContent);
        }
        fileContent = tmplCmd.compress(fileContent);
        fileContent = tmplCmd.store(fileContent, refTmplCommands); //模板命令移除，防止影响分析

        //console.log(refTmplEvents);
        fileContent = tmplCmd.tidy(fileContent);
        fileContent = tmplGuid.add(fileContent, guid, refGuidToKeys);
        //fileContent = Processor.run('tmpl:class', 'process', [fileContent, cssNamesMap]);

        //fileContent = Processor.run('tmpl:cmd', 'recover', [fileContent, refTmplCommands]);
        var info = tmplPartial.process(fileContent, refGuidToKeys, refTmplCommands, cssNamesMap);
        temp.info = info;
        fCache = temp;
    }
    return fCache;
};
module.exports = function(e) {
    return new Promise(function(resolve) {
        var cssNamesMap = e.cssNamesMap,
            from = e.from,
            moduleId = e.moduleId,
            fileContentCache = {};
        //仍然是读取view.js文件内容，把里面@到的文件内容读取进来
        e.content = e.content.replace(fileTmplReg, function(match, prefix, quote, name, ext) {
            name = atpath.resolvePath(name, moduleId);
            var file = path.resolve(path.dirname(from) + sep + name + '.html');
            var fileContent = name;
            var singleFile = (name == 'template' && e.contentInfo);
            if (singleFile || fs.existsSync(file)) {
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                var fcInfo = processTmpl(from, fileContent, fileContentCache, cssNamesMap);
                if (ext == ':events') { //事件
                    return fcInfo.events;
                }
                if (ext == ':data') {
                    return JSON.stringify(fcInfo.info.list);
                }
                if (ext == ':keys') {
                    return JSON.stringify(fcInfo.info.keys);
                }
                if (prefix && configs.outputTmplObject) {
                    return prefix + JSON.stringify({
                        html: fcInfo.info.tmpl,
                        subs: fcInfo.info.list
                    });
                }
                return (prefix ? prefix : '') + JSON.stringify(fcInfo.info.tmpl);
            }
            return quote + 'unfound:' + name + quote;
        });
        resolve(e);
    });
};