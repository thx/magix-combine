//处理a标签
let checker = require('./checker');
let tmplCmd = require('./tmpl-cmd');
let safedReg = /\brel\s*=\s*(["'])[^'"]*?noopener[^'"]*?\1/i;
let newWindowReg = /\btarget\s*=\s*(['"])[^'"]+\1/i;
module.exports = (e, tagName, match, refTmplCommands) => {
    let tn = tagName.toLowerCase();
    if (tn == 'a' || tn == 'area') {
        newWindowReg.lastIndex = 0;
        safedReg.lastIndex = 0;
        if (newWindowReg.test(match) && !safedReg.test(match)) {
            let newMatch = tmplCmd.recover(match, refTmplCommands);
            checker.Tmpl.markAttr(('add rel="noopener noreferrer" to ' + newMatch).red, 'at', e.shortHTMLFile.gray, 'more info:', 'https://github.com/asciidoctor/asciidoctor/issues/2071'.magenta);
        }
    }
    return match;
};