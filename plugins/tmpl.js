/*
    模板处理总入口
 */
let path = require('path');
let fs = require('fs');
let chalk = require('chalk');
let util = require('util');
let fd = require('./util-fd');
let deps = require('./util-deps');
let atpath = require('./util-atpath');
let configs = require('./util-config');
let tmplEvent = require('./tmpl-event');
let tmplCmd = require('./tmpl-cmd');
let tmplMxTag = require('./tmpl-mxtag');
let tmplGuid = require('./tmpl-guid');
let tmplAttr = require('./tmpl-attr');
let tmplClass = require('./tmpl-attr-class');
let tmplPartial = require('./tmpl-partial');
let unmatchChecker = require('./checker-tmpl-unmatch');
let tmplVars = require('./tmpl-vars');
let slog = require('./util-log');

let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let tmplVarsReg = /:(const|global|updateby)\[([^\[\]]+)\]/g;
let sep = path.sep;
let holder = '\u001f';
let removeVdReg = /\u0002/g;
let removeIdReg = /\u0001/g;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let unsupportCharsReg = /[\u0000-\u0007\u0011-\u0019\u001e\u001f]/g;

let processTmpl = (fileContent, cache, cssNamesMap, magixTmpl, e, reject, prefix, file, flagsInfo) => {
    let key = prefix + holder + magixTmpl + holder + fileContent;
    let fCache = cache[key];
    if (!fCache) {
        e.srcHTMLFile = file;
        e.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').slice(1);
        if (unsupportCharsReg.test(fileContent)) {
            slog.log(chalk.red(`unsupport character : ${unsupportCharsReg.source}`), 'at', chalk.magenta(e.shortHTMLFile));
            reject(new Error('unsupport character'));
            return;
        }
        try {
            fileContent = configs.compileTmpl(fileContent, e);
        } catch (ex) {
            slog.ever(chalk.red('compile template error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }

        try {
            fileContent = tmplMxTag.process(fileContent, {
                file
            });
        } catch (ex) {
            slog.ever(chalk.red('parser tmpl-mxtag error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }


        if (configs.checker.tmplTagsMatch) {
            try {
                unmatchChecker(fileContent);
            } catch (ex) {
                slog.ever(chalk.red('tags unmatched ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
                ex.message += ' at ' + e.shortHTMLFile;
                reject(ex);
                return;
            }
        }

        let temp = Object.create(null);
        cache[key] = temp;

        fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
        fileContent = tmplCmd.compile(fileContent);
        //console.log(fileContent);

        let refTmplCommands = Object.create(null);
        e.refLeakGlobal = {
            reassigns: []
        };
        if (magixTmpl) {
            fileContent = tmplVars.process(fileContent, reject, e, flagsInfo);
        }
        fileContent = tmplCmd.compress(fileContent);
        fileContent = tmplCmd.store(fileContent, refTmplCommands); //模板命令移除，防止影响分析
        if (configs.outputTmplWithEvents) {
            let tmplEvents = tmplEvent.extract(fileContent);
            temp.events = tmplEvents;
        }
        fileContent = tmplAttr.process(fileContent, e, refTmplCommands);
        try {
            fileContent = tmplCmd.tidy(fileContent);
        } catch (ex) {
            slog.ever(chalk.red('minify html error : ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            reject(ex);
            return;
        }
        if (magixTmpl) {
            fileContent = tmplGuid.add(fileContent, refTmplCommands, e.refLeakGlobal);
            //console.log(tmplCmd.recover(fileContent,refTmplCommands));
            if (e.refLeakGlobal.exists) {
                slog.ever(chalk.red('segment failed'), 'at', chalk.magenta(e.shortHTMLFile), 'more info:', chalk.magenta('https://github.com/thx/magix-combine/issues/21'));
                if (e.refLeakGlobal.reassigns) {
                    e.refLeakGlobal.reassigns.forEach(it => {
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
                    .replace(removeIdReg, '')
                    .replace(stringReg, '$1');
            }
        }
        if (magixTmpl) {
            let info = tmplPartial.process(fileContent, refTmplCommands, e, flagsInfo);
            temp.info = info;
        } else {
            temp.info = {
                tmpl: tmplCmd.recover(fileContent, refTmplCommands)
            };
        }
        fCache = temp;
    }
    return fCache;
};
module.exports = e => {
    return new Promise((resolve, reject) => {
        let cssNamesMap = e.cssNamesMap,
            from = e.from,
            moduleId = e.moduleId,
            fileContentCache = Object.create(null);

        //仍然是读取view.js文件内容，把里面@到的文件内容读取进来
        e.content = e.content.replace(configs.fileTmplReg, (match, prefix, quote, ctrl, name, ext, flags) => {
            name = atpath.resolvePath(name, moduleId);
            //console.log(raw,name,prefix,configs.outputTmplWithEvents);
            let file = path.resolve(path.dirname(from) + sep + name + '.' + ext);
            let fileContent = name;
            let singleFile = (name == 'template' && e.contentInfo);
            if (!singleFile) {
                deps.addFileDepend(file, e.from, e.to);
                e.fileDeps[file] = 1;
            } else {
                file = e.from;
            }
            if (singleFile || fs.existsSync(file)) {
                let magixTmpl = (!configs.disableMagixUpdater && prefix && ctrl != 'raw') || ctrl == 'magix' || ctrl == 'updater' || flags;
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                let flagsInfo = {};
                if (flags) {
                    flags.replace(tmplVarsReg, (m, key, vars) => {
                        if (key == 'const') {
                            if (!flagsInfo.tmplScopedConstVars)
                                flagsInfo.tmplScopedConstVars = Object.create(null);
                            for (let v of vars.split(',')) {
                                flagsInfo.tmplScopedConstVars[v] = 1;
                            }
                        } else if (key == 'global') {
                            if (!flagsInfo.tmplScopedGlobalVars)
                                flagsInfo.tmplScopedGlobalVars = Object.create(null);
                            for (let v of vars.split(',')) {
                                flagsInfo.tmplScopedGlobalVars[v] = 1;
                            }
                        } else if (key == 'updateby') {
                            if (!flagsInfo.tmplScopedUpdateBy)
                                flagsInfo.tmplScopedUpdateBy = Object.create(null);
                            for (let v of vars.split(',')) {
                                flagsInfo.tmplScopedUpdateBy[v] = 1;
                            }
                        }
                    });
                }
                let fcInfo = processTmpl(fileContent, fileContentCache, cssNamesMap, magixTmpl, e, reject, prefix, file, flagsInfo);
                if (magixTmpl) {
                    let temp = {
                        html: fcInfo.info.tmpl,
                        subs: fcInfo.info.list
                    };
                    if (configs.debug) temp.file = e.shortHTMLFile;
                    return (prefix || '') + JSON.stringify(temp);
                }
                if (prefix && configs.outputTmplWithEvents) {
                    return prefix + JSON.stringify({
                        html: fcInfo.info.tmpl,
                        events: fcInfo.events
                    });
                }
                return (prefix || '') + JSON.stringify(fcInfo.info.tmpl);
            }
            return (prefix || '') + quote + 'unfound file:' + name + '.' + ext + quote;
        });
        resolve(e);
    });
};