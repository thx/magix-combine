/*
    mx-view属性处理
 */

let attrUri = require('./tmpl-attr-uri');
//let tmplCmd = require('./tmpl-cmd');

let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]*?)\1/;
let viewAttrReg = /\s(?:view-|\*)([\w\-@]+)=(["'])([\s\S]*?)\2/g;
//let mxViewParamsReg = /\bmx-params\s*=\s*(['"])([^'"]+?)\1/;
let cmdReg = /\u0007\d+\u0007/g;
module.exports = (e, match, refTmplCommands, toSrc) => {
    if (mxViewAttrReg.test(match)) { //带有mx-view属性才处理
        match.replace(mxViewAttrReg, (m, q, content) => {
            let i = content.indexOf('?');
            if (i > -1) {
                content = content.slice(0, i);
            }
            cmdReg.lastIndex = 0;
            if (!cmdReg.test(content)) {
                if (!e.tmplMxViews) {
                    e.tmplMxViews = Object.create(null);
                }
                if (!e.tmplMxViews[content]) {
                    e.tmplMxViews[content] = 1;
                    e.tmplMxViewsArray = Object.keys(e.tmplMxViews);
                }
            } else {
                cmdReg.lastIndex = 0;
            }
        });
        return attrUri(match, e, 'view-', viewAttrReg, refTmplCommands, toSrc, mxViewAttrReg, 'mx-view');
    }
    return match;
};