/*
    处理img标签，加入修改src的钩子，用于动态加载如webp格式的图片
*/
let chalk = require('chalk');
let configs = require('./util-config');
let slog = require('./util-log');
let tmplCmd = require('./tmpl-cmd');
let srcReg = /src\s*=\s*(["'])([\s\S]+?)\1(?=\s|\/|>)/ig;
module.exports = (e, tagName, match, refTmplCommands, toSrc) => {
    if (tagName.toLowerCase() == 'img') {
        match = match.replace(srcReg, (m, q, value) => {
            value = tmplCmd.recover(value, refTmplCommands);
            value = configs.tmplImgSrcMatched(value);
            if (e.checker.tmplAttrImg) {
                slog.ever('[MXC Tip(tmpl-attr-img)] match:', toSrc(value), chalk.grey(e.shortHTMLFile));
            }
            return 'src=' + q + value + q;
        });
        match = tmplCmd.store(match, refTmplCommands);
    }
    return match;
};