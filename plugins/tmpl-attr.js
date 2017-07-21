/*
    属性处理总入口
 */
let attrMxEvent = require('./tmpl-attr-mxevent');
let attrMxView = require('./tmpl-attr-mxview');
let attrImg = require('./tmpl-attr-img');
let checker = require('./checker');
let tmplCmd = require('./tmpl-cmd');
let tagReg = /<([\w-]+)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
module.exports = {
    process(fileContent, e, refTmplCommands) {
        let toSrc = expr => {
            return e.toTmplSrc ? e.toTmplSrc(expr, refTmplCommands) : tmplCmd.recover(expr, refTmplCommands);
        };
        return fileContent.replace(tagReg, (match, tagName) => { //标签进入
            match = attrMxEvent(e, match, refTmplCommands, toSrc);
            match = attrMxView(e, match, refTmplCommands, toSrc);
            match = attrImg(e, tagName, match, refTmplCommands, toSrc);
            match = checker.Tmpl.checkTag(e, tagName, match, toSrc);
            return match;
        });
    }
};