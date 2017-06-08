let path = require('path');
let fs = require('fs');
let util = require('util');
let fd = require('./util-fd');
let deps = require('./util-deps');
let atpath = require('./util-atpath');
let configs = require('./util-config');
let tmplEvent = require('./tmpl-event');
let tmplCmd = require('./tmpl-cmd');
let tmplMxTag = require('./tmpl-mxtag');
let tmplGuid = require('./tmpl-guid');
let tmplClass = require('./tmpl-class');
let tmplPartial = require('./tmpl-partial');
let tmplVars = require('./tmpl-vars');
let tmplImg = require('./tmpl-img');
let tmplViewAttr = require('./tmpl-viewattr');
let slog = require('./util-log');
let checker = require('./checker');
let tmplChecker = checker.Tmpl;
//模板处理，即处理view.html文件
let fileTmplReg = /(\btmpl\s*:\s*)?(['"])(raw)?\u0012@([^'"]+)\.html(:data|:keys|:events)?\2/g;
let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let sep = path.sep;
let tagReg = /<[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>/g;
let mxEventReg = /\bmx-(?!view|vframe|init|owner|autonomy|datafrom)([a-zA-Z]+)\s*=\s*['"]/g;
let holder = '\u001f';
let magixHolder = '\u001e';
let removeVdReg = /\u0002/g;
let removeIdReg = /\u0001/g;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let processTmpl = (fileContent, cache, cssNamesMap, raw, e, reject, prefix, file) => {
    let key = prefix + holder + raw + holder + fileContent;
    let fCache = cache[key];
    if (!fCache) {
        let temp = {};
        cache[key] = temp;
        fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
        let extInfo = {
            file: file
        };
        e.shortFrom = e.from.replace(configs.moduleIdRemovedPath, '').slice(1);
        e.srcHTMLFile = file;
        e.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').slice(1);
        fileContent = tmplMxTag.process(fileContent, extInfo);

        let refTmplCommands = {};
        let refLeakGlobal = {
            reassigns: []
        };
        fileContent = tmplImg.process(fileContent, e);
        if (!configs.disableMagixUpdater && !raw) {
            fileContent = tmplVars.process(fileContent, reject, e.shortHTMLFile, refLeakGlobal);
        }
        fileContent = tmplCmd.compress(fileContent);
        fileContent = tmplCmd.store(fileContent, refTmplCommands); //模板命令移除，防止影响分析
        let tmplEvents = tmplEvent.extract(fileContent);
        temp.events = tmplEvents;
        if (configs.addEventPrefix) {
            fileContent = fileContent.replace(tagReg, (match) => {
                return match.replace(mxEventReg, (m, name) => {
                    if (tmplChecker.upperCaseReg.test(name)) {
                        name = 'mx-' + name;
                        tmplChecker.upperCaseReg.lastIndex = 0;
                        slog.ever(('avoid use ' + name).red, 'at', e.shortHTMLFile.gray, 'use', name.toLowerCase().red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
                    }
                    return m + holder + magixHolder;
                });
            });
        }
        fileContent = tmplViewAttr.process(fileContent, e, refTmplCommands);
        try {
            fileContent = tmplCmd.tidy(fileContent);
        } catch (ex) {
            slog.ever('minify error : ' + ex, ('html file: ' + e.shortHTMLFile).red);
            reject(ex);
        }
        if (prefix && !configs.disableMagixUpdater && !raw) {
            fileContent = tmplGuid.add(fileContent, refTmplCommands, refLeakGlobal);
            if (refLeakGlobal.exists) {
                slog.ever(e.shortHTMLFile.magenta, 'segment failed'.red, 'more info:', 'https://github.com/thx/magix-combine/issues/21'.magenta);
                if (refLeakGlobal.reassigns) {
                    refLeakGlobal.reassigns.forEach((it) => {
                        slog.ever(it);
                    });
                }
            }
        }

        fileContent = tmplClass.process(fileContent, cssNamesMap, refTmplCommands, e); //处理class name

        for (let p in refTmplCommands) {
            let cmd = refTmplCommands[p];
            if (util.isString(cmd)) {
                refTmplCommands[p] = cmd.replace(removeVdReg, '')
                    .replace(removeIdReg, '').replace(stringReg, '$1');
            }
        }
        let info = tmplPartial.process(fileContent, refTmplCommands, e);
        temp.info = info;
        fCache = temp;
    }
    return fCache;
};
module.exports = (e) => {
    return new Promise((resolve, reject) => {
        let cssNamesMap = e.cssNamesMap,
            from = e.from,
            moduleId = e.moduleId,
            fileContentCache = {};

        //仍然是读取view.js文件内容，把里面@到的文件内容读取进来
        e.content = e.content.replace(fileTmplReg, (match, prefix, quote, raw, name, ext) => {
            name = atpath.resolvePath(name, moduleId);
            //console.log(raw,name,prefix,configs.outputTmplWithEvents);
            let file = path.resolve(path.dirname(from) + sep + name + '.html');
            let fileContent = name;
            let singleFile = (name == 'template' && e.contentInfo);
            if (!singleFile) {
                deps.addFileDepend(file, e.from, e.to);
                e.fileDeps[file] = 1;
            } else {
                file = e.from;
            }
            if (singleFile || fs.existsSync(file)) {
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                let fcInfo = processTmpl(fileContent, fileContentCache, cssNamesMap, raw, e, reject, prefix, file);
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
                    let temp = {
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
            return (prefix || '') + quote + 'unfound file:' + name + '.html' + quote;
        });
        resolve(e);
    });
};