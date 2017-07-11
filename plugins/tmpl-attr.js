//属性处理模块
let attrMxEvent = require('./tmpl-attr-mxevent');
let attrMxView = require('./tmpl-attr-mxview');
let attrImg = require('./tmpl-attr-img');
let checker = require('./checker');
let tagReg = /<([\w-]+)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
module.exports = {
    process(fileContent, e, refTmplCommands) {
        return fileContent.replace(tagReg, (match, tagName) => { //标签进入
            match = attrMxEvent(e, match, refTmplCommands);
            match = attrMxView(e, match, refTmplCommands);
            match = attrImg(e, tagName, match, refTmplCommands);
            match = checker.Tmpl.checkTag(e, tagName, match, refTmplCommands);
            return match;
        });
    }
};