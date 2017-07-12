//处理img标签
let configs = require('./util-config');
let slog = require('./util-log');
let tmplCmd = require('./tmpl-cmd');
let srcReg = /src\s*=\s*(["'])([\s\S]+?)\1(?=\s|\/|>)/ig;
module.exports = (e, tagName, match, refTmplCommands) => {
    if (tagName.toLowerCase() == 'img') {
        match = match.replace(srcReg, (m, q, value) => {
            value = tmplCmd.recover(value, refTmplCommands);
            value = configs.tmplImgSrcMatched(value);
            if (configs.check) {
                slog.ever('tmpl-attr-img match:', value, e.shortHTMLFile.gray);
            }
            return 'src=' + q + value + q;
        });
        match = tmplCmd.store(match, refTmplCommands);
    }
    return match;
};