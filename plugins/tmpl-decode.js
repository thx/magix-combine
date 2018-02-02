/*
    提前decode文本中的实体
    因需要处理url中的&符号,故目前暂用不到该文件
*/
let tmplUnescape = require('html-entities-decoder');
let tmplCmd = require('./tmpl-cmd');
let unescapeReg = /&#?[^;\W]+;?/g;
let keep = {
    '&lt;': 1,
    '&gt;': 1,
    '&amp;': 1
};
let translate = {
    '&#60;': '&lt;',
    '&#x3c;': '&lt;',
    '&#62;': '&gt;',
    '&#x3e;': '&gt;',
    '&#38;': '&amp;',
    '&#x26;': '&amp;'
};
module.exports = tmpl => {
    let store = Object.create(null);
    tmpl = tmplCmd.store(tmpl, store);
    tmpl = tmpl.replace(unescapeReg, m => {
        let lm = m.toLowerCase();
        if (!lm.endsWith(';')) {
            lm = lm + ';';
        }
        if (translate.hasOwnProperty(lm)) {
            return translate[lm];
        }
        if (keep.hasOwnProperty(lm)) {
            return lm;
        }
        let t = tmplUnescape(lm);
        if (t != lm) {
            return t;
        }
        return m;
    });
    tmpl = tmplCmd.recover(tmpl, store);
    return tmpl;
};