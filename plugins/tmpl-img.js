//处理img标签
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let slog = require('./util-log');
let imgTagReg = /<img\s+[^>]*>/ig;
let srcReg = /src\s*=\s*(["'])([\s\S]+?)\1(?=\s|\/|>)/ig;
module.exports = {
    process(tmpl, e) {
        let cmdCache = {};
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let restore = (tmpl) => {
            return tmplCmd.recover(tmpl, cmdCache);
        };
        let attrsProcessor = (attrs) => {
            attrs = attrs.replace(srcReg, (match, q, value) => {
                if (configs.logUrl) {
                    slog.ever('tmpl-img match:', value, e.shortHTMLFile.gray);
                }
                value = configs.tmplImgSrcMatched(value);
                return 'src=' + q + value + q;
            });
            return attrs;
        };
        let tagProcessor = (match) => {
            match = restore(match);
            match = attrsProcessor(match);
            return match;
        };
        tmpl = tmpl.replace(imgTagReg, tagProcessor);
        tmpl = restore(tmpl);
        return tmpl;
    }
};