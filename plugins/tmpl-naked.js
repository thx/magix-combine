let configs = require('./util-config');
let fd = require('./util-fd');
let tmplCmd = require('./tmpl-cmd');
let mxTailReg = /\.mx$/;
let templateReg = /<template>([\s\S]+?)<\/template>/i;
let pureTagReg = /<[^>\s\/]+[^>]*>/g;
let processTmpl = (tmpl) => {
    let store = {};
    tmpl = tmplCmd.store(tmpl, store);
    tmpl = tmpl.replace(pureTagReg, configs.tmplTagProcessor);
    tmpl = tmplCmd.recover(tmpl, store);
    return tmpl;
};
let processMx = (content) => {
    content = content.replace(templateReg, (match, body) => {
        return '<template>' + processTmpl(body) + '</template>';
    });
    return content;
};
module.exports = {
    process(from) {
        return new Promise((resolve) => {
            if (configs.tmplFileExtNamesReg.test(from)) {
                let content = fd.read(from);
                if (mxTailReg.test(from)) {
                    let mxContent = processMx(content);
                    if (content != mxContent) {
                        fd.write(from, mxContent);
                    }
                    resolve();
                } else {
                    let tmplContent = processTmpl(content);
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