/*
    模板处理并回写，常用于打点等功能
 */
let path = require('path');
let configs = require('./util-config');
let fd = require('./util-fd');
let tmplCmd = require('./tmpl-cmd');
let attrType = require('./tmpl-attr-type');
let mxTailReg = /\.mx$/;
let templateReg = /<template([^>]*)>([\s\S]+?)<\/template>/i;
let pureTagReg = /<[\w-]+[^>]*>/g;
let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let commentPHReg = /\x00\d+\x00/g;
let processTmpl = (tmpl, shortFrom) => {
    let store = Object.create(null);
    let comment = Object.create(null);
    let cIdx = 0;
    /*tmpl = configs.compileTmplStart(tmpl, {
        shortFrom,
        templateLang: tLang
    });*/
    tmpl = tmplCmd.store(tmpl, store);
    tmpl = tmplCmd.store(tmpl, store, configs.artTmplCommand);
    
    tmpl = tmpl.replace(htmlCommentCelanReg, m => {
        let key = '\x00' + cIdx++ + '\x00';
        comment[key] = m;
        return key;
    });
    //console.log(tmpl);
    tmpl = tmpl.replace(pureTagReg, m => {
        return configs.tmplTagProcessor(m, shortFrom);
    });
    tmpl = tmpl.replace(commentPHReg, m => comment[m]);
    tmpl = tmplCmd.recover(tmpl, store);
    //tmpl = configs.compileTmplEnd(tmpl);
    return tmpl;
};
let processMx = (content, shortFrom) => {
    content = content.replace(templateReg, (match, lang, body) => {
        let tLang = 'html';
        if (lang) {
            lang = attrType.extractLang(lang);
            if (lang) {
                tLang = lang;
            }
        }
        return '<template>' + processTmpl(body, shortFrom, tLang) + '</template>';
    });
    return content;
};
module.exports = {
    process(from) {
        return new Promise(resolve => {
            if (configs.tmplFileExtNamesReg.test(from)) {
                let content = fd.read(from);
                let shortFrom = from.replace(configs.moduleIdRemovedPath, '');
                if (mxTailReg.test(from)) {
                    let mxContent = processMx(content, shortFrom);
                    if (content != mxContent) {
                        fd.write(from, mxContent);
                    }
                    resolve();
                } else {
                    let ext = path.extname(from);
                    let tmplContent = processTmpl(content, shortFrom, ext.slice(1));
                    if (tmplContent != content) {
                        fd.write(from, tmplContent);
                    }
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }
};