var path = require('path');
var fs = require('fs');
var fd = require('./util-fd');
var atpath = require('./util-atpath');
//var md5 = require('./util-md5');
var configs = require('./util-config');
var tmplEvent = require('./tmpl-event');
var tmplCmd = require('./tmpl-cmd');
var tmplMxTag = require('./tmpl-mxtag');
var tmplGuid = require('./tmpl-guid');
var tmplPartial = require('./tmpl-partial');
var tmplMxTmpl = require('./tmpl-mxtmpl');
var tmplImg = require('./tmpl-img');
var mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
var viewAttrReg = /\bview-(\w+)=(["'])([\s\S]*?)\2/g;
//模板处理，即处理view.html文件
var fileTmplReg = /(\btmpl\s*:\s*)?(['"])(raw)?@([^'"]+)\.html(:data|:keys|:events)?\2/g;
var htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
var sep = path.sep;
var tagReg = /<[\w]+[^>]*?>/g;
var mxEventReg = /\bmx-(?!view|vframe|keys|options|data|partial|init)[a-zA-Z]+\s*=\s*['"]/g;
var holder = '\u001f';
var magixHolder = '\u001e';
var processTmpl = function(e, from, fileContent, cache, cssNamesMap, raw) {
    var fCache = cache[fileContent];
    if (!fCache) {
        var temp = {};
        cache[fileContent] = temp;
        fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
        fileContent = tmplMxTag.process(fileContent);
        var tmplEvents = tmplEvent.extract(fileContent);
        temp.events = tmplEvents;

        //var guid = md5(e.moduleId);
        var refTmplCommands = {};
        fileContent = tmplImg.process(fileContent);
        if (!configs.disableMagixUpdater && !raw) {
            fileContent = tmplMxTmpl.process(fileContent);
        }
        fileContent = tmplCmd.compress(fileContent);
        fileContent = tmplCmd.store(fileContent, refTmplCommands); //模板命令移除，防止影响分析
        if (!configs.disableMagixUpdater) {
            fileContent = fileContent.replace(tagReg, function(match) {
                if (mxViewAttrReg.test(match) && viewAttrReg.test(match)) {
                    //console.log(match);
                    var attrs = [];
                    match = match.replace(viewAttrReg, function(m, name, q, content) {
                        attrs.push(name + '=' + content);
                        return '';
                    });
                    match = match.replace(mxViewAttrReg, function(m, q, content) {
                        attrs = attrs.join('&');
                        if (content.indexOf('?') > -1) {
                            content = content + '&' + attrs;
                        } else {
                            content = content + '?' + attrs;
                        }
                        return 'mx-view=' + q + content + q;
                    });
                }
                return match.replace(mxEventReg, '$&' + holder + magixHolder);
            });
        }
        fileContent = tmplCmd.tidy(fileContent);
        if (!configs.disableMagixUpdater && !raw) {
            fileContent = tmplGuid.add(fileContent, refTmplCommands);
        }
        //if (raw) cssNamesMap = {};
        var info = tmplPartial.process(fileContent, refTmplCommands, cssNamesMap);
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
        e.content = e.content.replace(fileTmplReg, function(match, prefix, quote, raw, name, ext) {
            name = atpath.resolvePath(name, moduleId);
            //console.log(raw,name,prefix,configs.outputTmplWithEvents);
            var file = path.resolve(path.dirname(from) + sep + name + '.html');
            var fileContent = name;
            var singleFile = (name == 'template' && e.contentInfo);
            if (singleFile || fs.existsSync(file)) {
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                var fcInfo = processTmpl(e, from, fileContent, fileContentCache, cssNamesMap, raw);
                if (ext == ':events') { //事件
                    return JSON.stringify(fcInfo.events);
                }
                if (ext == ':subs') {
                    return JSON.stringify(fcInfo.info.list);
                }
                if (ext == ':keys') {
                    return JSON.stringify(fcInfo.info.keys);
                }
                if (prefix && !configs.disableMagixUpdater && !raw) {
                    var temp = {
                        html: fcInfo.info.tmpl,
                        subs: fcInfo.info.list
                    };
                    if (configs.outputTmplWithEvents) {
                        temp.events = fcInfo.events;
                    }
                    return prefix + JSON.stringify(temp);
                }
                if (prefix && configs.outputTmplWithEvents) {
                    return prefix + JSON.stringify({
                        html: fcInfo.info.tmpl,
                        events: fcInfo.events
                    });
                }
                return (prefix || '') + JSON.stringify(fcInfo.info.tmpl);
            }
            return (prefix || '') + quote + 'unfound:' + name + quote;
        });
        resolve(e);
    });
};