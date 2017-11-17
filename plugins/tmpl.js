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
let tmplSyntaxChecker = require('./checker-js-tmplsyntax');
let checker = require('./checker');
let tmplVars = require('./tmpl-vars');
let md5 = require('./util-md5');
let slog = require('./util-log');
let revisableReg = /@\{[^\{\}]+\}/g;

let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let tmplVarsReg = /:(const|global|updateby)\[([^\[\]]*)\]/g;
let sep = path.sep;
let holder = '\u001f';
let removeVdReg = /\u0002/g;
let removeIdReg = /\u0001/g;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let unsupportCharsReg = /[\u0000-\u0007\u0011-\u0019\u001e\u001f]/g;

let processTmpl = (fileContent, cache, cssNamesMap, magixTmpl, e, reject, prefix, file, flagsInfo, lang) => {
    let key = prefix + holder + magixTmpl + holder + fileContent;
    let fCache = cache[key];
    if (!fCache) {
        if (unsupportCharsReg.test(fileContent)) {
            slog.log(chalk.red(`unsupport character : ${unsupportCharsReg.source}`), 'at', chalk.magenta(e.shortHTMLFile));
            reject(new Error('unsupport character'));
            return;
        }
        try {
            e.templateLang = lang;
            fileContent = configs.compileTmplStart(fileContent, e);
        } catch (ex) {
            slog.ever(chalk.red('compile template error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }

        //convert tmpl syntax

        if (e.checker.tmplTagsMatch) {
            try {
                unmatchChecker(fileContent);
            } catch (ex) {
                slog.ever(chalk.red('tags unmatched ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
                ex.message += ' at ' + e.shortHTMLFile;
                reject(ex);
                return;
            }
        }

        try {
            fileContent = tmplMxTag.process(fileContent, {
                moduleId: e.moduleId,
                pkgName: e.pkgName,
                checkTmplDuplicateAttr: e.checker.tmplDuplicateAttr,
                file,
                shortHTMLFile: e.shortHTMLFile
            });
        } catch (ex) {
            slog.ever(chalk.red('parser tmpl-mxtag error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }



        if (e.checker.tmplTagsMatch) {
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

        //非禁用updater的情况下才进行语法检测
        if (e.checker.tmplCmdSyntax && (!configs.disableMagixUpdater || magixTmpl)) {
            try {
                tmplSyntaxChecker(fileContent);
            } catch (ex) {
                slog.ever(chalk.red('tmpl js syntax error: ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile), 'near');
                for (let i = 0; i < ex.lines.length; i++) {
                    let c = ex.lines[i];
                    if (i == ex.index) {
                        let left = c.slice(0, ex.column);
                        let right = c.slice(ex.column);
                        slog.ever(chalk.red(left) + chalk.bold.red(right));
                    } else {
                        slog.ever(chalk.magenta(c));
                    }
                }
                for (let cause of ex.reasons) {
                    slog.ever(chalk.red('check ' + cause.value + ' of line: ' + cause.line));
                }
                reject(ex);
                return;
            }
        }
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
        if (!configs.debug) {
            fileContent = fileContent.replace(revisableReg, m => {
                let src = tmplCmd.recover(m, refTmplCommands);
                checker.Tmpl.checkStringRevisable(m, src, e);
                return md5(m, 'revisableString', configs.revisableStringPrefix);
            });
        }
        if (configs.tmplOutputWithEvents) {
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

        fileContent = configs.compileTmplEnd(fileContent);
        //console.log(JSON.stringify(fileContent),refTmplCommands);
        fileContent = tmplClass.process(fileContent, cssNamesMap, refTmplCommands, e); //处理class name
        if (magixTmpl) {
            for (let p in refTmplCommands) {
                let cmd = refTmplCommands[p];
                if (util.isString(cmd)) {
                    refTmplCommands[p] = cmd.replace(removeVdReg, '')
                        .replace(removeIdReg, '')
                        .replace(stringReg, '$1');
                }
            }
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
            //console.log(raw,name,prefix,configs.tmplOutputWithEvents);
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
                let lang = singleFile ? e.contentInfo.templateLang : ext;

                e.srcHTMLFile = file;
                e.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').slice(1);
                if (ext != lang) {
                    slog.ever(chalk.red('conflicting template language'), 'at', chalk.magenta(e.shortHTMLFile), 'near', chalk.magenta(match + ' and ' + e.contentInfo.templateTag));
                }
                let flagsInfo = {};
                if (flags) {
                    flags.replace(tmplVarsReg, (m, key, vars) => {
                        vars = vars.trim();
                        vars = vars.split(',');
                        let setKey = '';
                        if (key == 'const') {
                            setKey = 'tmplScopedConstVars';
                        } else if (key == 'global') {
                            setKey = 'tmplScopedGlobalVars';
                        } else if (key == 'updateby') {
                            setKey = 'tmplScopedUpdateBy';
                        }
                        if (!flagsInfo[setKey])
                            flagsInfo[setKey] = Object.create(null);
                        for (let v of vars) {
                            flagsInfo[setKey][v] = 1;
                        }
                    });
                }
                let fcInfo = processTmpl(fileContent, fileContentCache, cssNamesMap, magixTmpl, e, reject, prefix, file, flagsInfo, lang);
                if (magixTmpl) {
                    let temp = {
                        html: fcInfo.info.tmpl,
                        subs: fcInfo.info.list
                    };
                    if (configs.debug) temp.file = e.shortHTMLFile;
                    if (configs.tmplOutputWithEvents) temp.events = fcInfo.events;
                    return (prefix || '') + JSON.stringify(temp);
                }
                if (prefix && configs.tmplOutputWithEvents) {
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