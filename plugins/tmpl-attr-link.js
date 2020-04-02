
let attrUri = require('./tmpl-attr-uri');
let hrefAttrReg = /\bhref\s*=\s*(['"])([^'"]*?)\1/;
let paramsReg = /\bparam-([\w\-@]*)=(["'])([\s\S]*?)\2/g;

module.exports = (e, tagName, match, refTmplCommands, toSrc) => {
    if (tagName == 'a' || tagName == 'area') {
        if (hrefAttrReg.test(match)) {
            return attrUri(match, e, 'param-', paramsReg, refTmplCommands, toSrc, hrefAttrReg, 'href');
        }
    }
    return match;
};