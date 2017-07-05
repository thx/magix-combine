//mx事件处理
let configs = require('./util-config');
let checker = require('./checker');
let slog = require('./util-log');
let tmplChecker = checker.Tmpl;
let mxEventReg = /\bmx-(?!view|vframe|init|owner|autonomy|datafrom)([a-zA-Z]+)\s*=\s*['"]/g;
let magixHolder = '\u001e';
let holder = '\u001f';
module.exports = (e, match) => {
    if (configs.addEventPrefix) { //增加事件前缀
        match = match.replace(mxEventReg, (m, name) => { //查找事件
            if (tmplChecker.upperCaseReg.test(name)) {
                name = 'mx-' + name;
                tmplChecker.upperCaseReg.lastIndex = 0;
                slog.ever(('avoid use ' + name).red, 'at', e.shortHTMLFile.gray, 'use', name.toLowerCase().red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
            }
            return m + holder + magixHolder;
        });
    }
    return match;
};