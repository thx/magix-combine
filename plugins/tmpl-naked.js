/*
    模板处理并回写，常用于打点等功能
 */
let configs = require('./util-config');
let fd = require('./util-fd');
let tmplCmd = require('./tmpl-cmd');
let mxTailReg = /\.mx$/;
let templateReg = /<template>([\s\S]+?)<\/template>/i;
let pureTagReg = /<[\w-]+[^>]*>/g;
let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let commentPHReg = /\u0000\d+\u0000/g;
let processTmpl = (tmpl, shortFrom) => {
    let store = Object.create(null);
    let comment = Object.create(null);
    let cIdx = 0;
    tmpl = tmplCmd.store(tmpl, store);

    tmpl = tmpl.replace(htmlCommentCelanReg, m => {
        let key = '\u0000' + cIdx++ + '\u0000';
        comment[key] = m;
        return key;
    });
    //console.log(tmpl);
    tmpl = tmpl.replace(pureTagReg, m => {
        return configs.tmplTagProcessor(m, shortFrom);
    });
    tmpl = tmplCmd.recover(tmpl, store);
    tmpl = tmpl.replace(commentPHReg, m => comment[m]);
    return tmpl;
};
let processMx = (content, shortFrom) => {
    content = content.replace(templateReg, (match, body) => {
        return '<template>' + processTmpl(body, shortFrom) + '</template>';
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
                    let tmplContent = processTmpl(content, shortFrom);
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