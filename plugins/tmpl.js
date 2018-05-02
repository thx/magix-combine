/*
    模板处理总入口
 */
let path = require('path');
let fs = require('fs');
let chalk = require('chalk');
let util = require('util');
let utils = require('./util');
let fd = require('./util-fd');
let deps = require('./util-deps');
let atpath = require('./util-atpath');
let configs = require('./util-config');
let tmplEvent = require('./tmpl-event');
let tmplCmd = require('./tmpl-cmd');
let tmplArt = require('./tmpl-art');
let tmplCutsomTag = require('./tmpl-customtag');
let tmplGuid = require('./tmpl-guid');
let tmplAttr = require('./tmpl-attr');
let tmplClass = require('./tmpl-attr-class');
let tmplPartial = require('./tmpl-partial');
let tmplStatic = require('./tmpl-static');
let unmatchChecker = require('./checker-tmpl-unmatch');
let checker = require('./checker');
let tmplVars = require('./tmpl-vars');
let md5 = require('./util-md5');
let slog = require('./util-log');
let tmplToFn = require('./tmpl-tofn');
//let tmplDecode = require('./tmpl-decode');
let revisableReg = /@\{[a-zA-Z\.0-9\-\~#_]+\}/g;

let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let tmplVarsReg = /:(const|global|updateby)\[([^\[\]]*)\]/g;
let artEngineReg = /:art(?:\s*=\s*(true|false))?(?:$|:)/;
let sep = path.sep;
let holder = '\u001f';
let removeVdReg = /\u0002/g;
let removeIdReg = /\u0001/g;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let unsupportCharsReg = /[\u0000-\u0007\u0011-\u0019\u001e\u001f]/g;

let processTmpl = (fileContent, cache, cssNamesMap, magixTmpl, e, reject, file, flagsInfo, lang) => {
    let key = magixTmpl + holder + fileContent;
    let fCache = cache[key];
    if (!fCache) {
        if (unsupportCharsReg.test(fileContent)) {
            slog.log(chalk.red(`unsupport character : ${unsupportCharsReg.source}`), 'at', chalk.magenta(e.shortHTMLFile));
            reject(new Error('unsupport character'));
            return;
        }
        e.templateLang = lang;
        try {
            fileContent = configs.compileTmplStart(fileContent, e);
        } catch (ex) {
            slog.ever(chalk.red('compile template error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }
        if (flagsInfo.artEngine) {
            fileContent = tmplArt(fileContent, e);
        }
        if (e.checker.tmplTagsMatch) {
            try {
                unmatchChecker(fileContent, e);
            } catch (ex) {
                slog.ever(chalk.red('tags unmatched ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
                ex.message += ' at ' + e.shortHTMLFile;
                reject(ex);
                return;
            }
        }
        let srcContent = fileContent;
        try {
            fileContent = tmplCutsomTag.process(fileContent, {
                moduleId: e.moduleId,
                pkgName: e.pkgName,
                //checkTmplDuplicateAttr: e.checker.tmplDuplicateAttr,
                srcOwnerHTMLFile: file,
                shortOwnerHTMLFile: e.shortHTMLFile,
                artEngine: flagsInfo.artEngine
            }, e);
        } catch (ex) {
            slog.ever(chalk.red('parser tmpl-customtag error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }

        //console.log(fileContent);
        //如果经过自定义标签后内容不一致，则进行再次的处理
        if (flagsInfo.artEngine && srcContent != fileContent) {
            fileContent = tmplArt(fileContent, e);
        }

        //console.log(fileContent);

        if (e.checker.tmplTagsMatch && srcContent != fileContent) {
            try {
                unmatchChecker(fileContent, e);
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
            if (configs.magixUpdaterIncrement) {
                if (configs.tmplStaticAnalyze) {
                    fileContent = tmplStatic(fileContent, e.shortHTMLFile);
                }
            } else {
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
        }

        fileContent = configs.compileTmplEnd(fileContent);
        fileContent = tmplClass.process(fileContent, cssNamesMap, refTmplCommands, e); //处理class name
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
        e.content = e.content.replace(configs.fileTmplReg, (match, quote, ctrl, name, ext, flags) => {
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
                let magixTmpl = ctrl != 'raw' || flags;
                if (configs.disableMagixUpdater) {
                    magixTmpl = false;
                }
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                let lang = singleFile ? e.contentInfo.templateLang : ext;
                e.htmlModuleId = utils.extractModuleId(file);
                e.srcHTMLFile = file;
                e.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').substring(1);
                if (ext != lang) {
                    slog.ever(chalk.red('conflicting template language'), 'at', chalk.magenta(e.shortHTMLFile), 'near', chalk.magenta(match + ' and ' + e.contentInfo.templateTag));
                }
                let flagsInfo = {
                    artEngine: configs.tmplArtEngine,
                    tmplScopedGlobalVars: Object.assign(Object.create(null), configs.tmplGlobalVars),
                    tmplScopedConstVars: Object.assign(Object.create(null), configs.tmplConstVars)
                };
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
                    let m = flags.match(artEngineReg);
                    if (m) {
                        flagsInfo.artEngine = true;
                        if (m[1]) {
                            flagsInfo.artEngine = m[1] === 'true';
                        }
                    }
                }
                let fcInfo = processTmpl(fileContent, fileContentCache, cssNamesMap, magixTmpl, e, reject, file, flagsInfo, lang);
                if (magixTmpl) {
                    if (configs.magixUpdaterIncrement) {
                        let tmpl = fcInfo.info.tmpl;
                        //tmpl = tmplDecode(tmpl);
                        return tmplToFn(tmpl, e.shortHTMLFile);
                    }
                    let temp = {
                        html: fcInfo.info.tmpl,
                        subs: fcInfo.info.list
                    };
                    if (configs.debug) temp.file = e.shortHTMLFile;
                    if (configs.tmplOutputWithEvents) temp.events = fcInfo.events;
                    return JSON.stringify(temp);
                }
                return JSON.stringify(fcInfo.info.tmpl);
            }
            return quote + 'unfound file:' + name + '.' + ext + quote;
        });
        resolve(e);
    });
};