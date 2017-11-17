
let chalk = require('chalk');
let slog = require('./util-log');
let tmplCmd = require('./tmpl-cmd');
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
module.exports = (n, e, refTmplCommands, attr) => {
    let temp = Object.create(null);
    for (let a of n.attrs) {
        if (!tmplCommandAnchorRegTest.test(a.name)) {
            if (!temp[a.name]) {
                temp[a.name] = 1;
            } else {
                slog.ever('duplicate attr:', chalk.red(a.name), 'near:', chalk.magenta(tmplCmd.recover(attr, refTmplCommands)), ' relate file:', chalk.grey(e.shortHTMLFile));
            }
        }
    }
};