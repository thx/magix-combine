/*
    mx-view属性处理
 */
let atpath = require('./util-atpath');
let configs = require('./util-config');
let checker = require('./checker');
let tmplCmd = require('./tmpl-cmd');
let classRef = require('./tmpl-attr-classref');
let tmplUnescape = require('html-entities-decoder');
let tmplChecker = checker.Tmpl;
//let tmplCmd = require('./tmpl-cmd');

let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
let viewAttrReg = /\bview-([\w\-@]+)=(["'])([\s\S]*?)\2/g;
//let mxViewParamsReg = /\bmx-params\s*=\s*(['"])([^'"]+?)\1/;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%([=!])([\s\S]+?)%>/g;
// let paramsReg = /([^=&?\/#]+)=?[^&#?]*/g;

// let hyphenateRE = /(?=[^-])([A-Z]+)/g;
// let hyphenate = fcache(str => {
//     return str
//         .replace(hyphenateRE, '-$1')
//         .toLowerCase();
// });

let encodeMore = {
    '!': '%21',
    '\'': '%27',
    '(': '%28',
    ')': '%29',
    '*': '%2A'
};

let encodeMoreReg = /[!')(*]/g;
let encodeReplacor = m => encodeMore[m];
module.exports = (e, match, refTmplCommands, toSrc) => {
    if (mxViewAttrReg.test(match)) { //带有mx-view属性才处理
        let classLocker = Object.create(null);
        if (configs.useAtPathConverter) { //如果启用@路径转换规则
            match = match.replace(mxViewAttrReg, (m, q, c) => {
                if (c.startsWith('@@')) {
                    return 'mx-view="' + c.slice(1) + '"';
                }
                if (c.startsWith('.')) {
                    m = 'mx-view="@' + c + '"';
                }
                return atpath.resolvePath(m, e.htmlModuleId);
            });
        }

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
        viewAttrReg.lastIndex = 0;
        if (viewAttrReg.test(match)) { //如果是view-开头的属性
            //console.log(match);
            viewAttrReg.lastIndex = 0;
            let attrs = [];
            match = match.replace(viewAttrReg, (m, name, q, content) => {
                //let oName = name;
                let cmdTemp = []; //处理属性中带命令的情况
                name = tmplChecker.checkMxViewParams(name, e);
                content.replace(cmdReg, cm => {
                    cmdTemp.push(cm); //把命令暂存下来
                });
                let cs = content.split(cmdReg); //按命令拆分，则剩余的都是普通字符串
                if (name.startsWith('@')) {
                    let cmdContent = tmplCmd.extractCmdContent(content, refTmplCommands);
                    if (cmdContent.succeed) {
                        attrs.push(`<%if(${cmdContent.content}){%>${name.slice(1)}=${content}<%}%>`);
                    } else {
                        tmplChecker.checkAtAttr(toSrc(name + '="' + content + '"'), e);
                    }
                } else {
                    for (let i = 0; i < cs.length; i++) {
                        cs[i] = tmplUnescape(cs[i]); //对转义字符回转一次，浏览器的行为，这里view-最终并不是标签属性，所以这里模拟浏览器的特性。
                        cs[i] = classRef(cs[i], e, classLocker);
                        cs[i] = encodeURIComponent(cs[i]).replace(encodeMoreReg, encodeReplacor); //对这个普通字符串做转义处理
                        if (i < cmdTemp.length) { //把命令还原回去
                            cs[i] = cs[i] + cmdTemp[i];
                        }
                    }
                    content = cs.join('');
                    attrs.push(name + '=' + content); //处理成最终的a=b形式
                }
                return ''; //'view-' + oName;
            });
            match = match.replace(mxViewAttrReg, (m, q, content) => {
                attrs = attrs.join('&'); //把参数加到mx-viewk中
                if (content.indexOf('?') > -1) {
                    content = content + '&' + attrs;
                } else {
                    content = content + '?' + attrs;
                }
                content = tmplCmd.store(content, refTmplCommands);
                return 'mx-view=' + q + content + q;
            });
        }
        /*let mxParams = '';
        match = match.replace(mxViewParamsReg, (m, q, c) => {
            mxParams = c;
            return '';
        });
        if (mxParams) {
            match = match.replace(mxViewAttrReg, (m, q, content) => {
                if (content.indexOf('?') > -1) {
                    content = content + '&\x1e=' + mxParams;
                } else {
                    content = content + '?\x1e=' + mxParams;
                }
                return 'mx-view=' + q + content + q;
            });
        }*/
        let testCmd = (m, q, content) => {
            q = content.indexOf('?');
            if (q >= 0) {
                content.substring(q + 1).replace(cmdReg, cm => {
                    let cmd = refTmplCommands[cm];
                    if (cmd) {
                        cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                            tmplChecker.checkMxViewParamsEscape(o, toSrc(m), content.substring(0, q), e);
                            return '<%!$eu(' + c + ')%>';
                        });
                        refTmplCommands[cm] = cmd;
                    }
                });
            }
        };
        match.replace(mxViewAttrReg, testCmd);
    }
    return match;
};