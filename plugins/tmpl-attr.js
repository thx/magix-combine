//属性处理模块
let attrMxEvent = require('./tmpl-attr-mxevent');
let attrMxView = require('./tmpl-attr-mxview');
let tagImg = require('./tmpl-tag-img');
let tagA = require('./tmpl-tag-a');
let tagReg = /<([\w-]+)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
module.exports = {
    process(fileContent, e, refTmplCommands) {
        return fileContent.replace(tagReg, (match, tagName) => { //标签进入
            match = attrMxEvent(e, match);
            match = attrMxView(e, match, refTmplCommands);
            match = tagImg(e, tagName, match, refTmplCommands);
            match = tagA(e, tagName, match, refTmplCommands);
            return match;
        });
    }
};