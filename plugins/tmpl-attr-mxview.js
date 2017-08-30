/*
    mx-view属性处理
 */
let atpath = require('./util-atpath');
let configs = require('./util-config');
let checker = require('./checker');
let tmplUnescape = require('html-entities-decoder');
let tmplChecker = checker.Tmpl;
//let tmplCmd = require('./tmpl-cmd');

let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
let viewAttrReg = /\bview-([\w\-]+)=(["'])([\s\S]*?)\2/g;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%([=!])([\s\S]+?)%>/g;

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
    mxViewAttrReg.lastIndex = 0;
    if (mxViewAttrReg.test(match)) { //带有mx-view属性才处理
        if (configs.useAtPathConverter) { //如果启用@路径转换规则
            let escape = false;
            match = match.replace(mxViewAttrReg, (m, q, c) => {
                if (c.indexOf('@@') === 0) {
                    escape = true;
                    return 'mx-view="' + c.slice(1) + '"';
                }
                return m;
            });
            if (!escape) {
                match = atpath.resolvePath(match, e.moduleId); //先把view对应的路径转换过来
            }
        }
        if (viewAttrReg.test(match)) { //如果是view-开头的属性
            //console.log(match);
            let attrs = [];
            match = match.replace(viewAttrReg, (m, name, q, content) => {
                let oName = name;
                let cmdTemp = []; //处理属性中带命令的情况
                name = tmplChecker.checkMxViewParams(name, e);
                content.replace(cmdReg, cm => {
                    cmdTemp.push(cm); //把命令暂存下来
                });
                let cs = content.split(cmdReg); //按命令拆分，则剩余的都是普通字符串
                for (let i = 0; i < cs.length; i++) {
                    cs[i] = tmplUnescape(cs[i]); //对转义字符回转一次，浏览器的行为，这里view-最终并不是标签属性，所以这里模拟浏览器的特性。
                    cs[i] = encodeURIComponent(cs[i]).replace(encodeMoreReg, encodeReplacor); //对这个普通字符串做转义处理
                    if (i < cmdTemp.length) { //把命令还原回去
                        cs[i] = cs[i] + cmdTemp[i];
                    }
                }
                content = cs.join('');
                attrs.push(name + '=' + content); //处理成最终的a=b形式
                return 'view-' + oName;
            });
            match = match.replace(mxViewAttrReg, (m, q, content) => {
                attrs = attrs.join('&'); //把参数加到mx-viewk中
                if (content.indexOf('?') > -1) {
                    content = content + '&' + attrs;
                } else {
                    content = content + '?' + attrs;
                }
                return 'mx-view=' + q + content + q;
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
                e.tmplMxViews[content] = 1;
                e.tmplMxViewsArray = Object.keys(e.tmplMxViews);
            }
        });
        let testCmd = (m, q, content) => {
            q = content.indexOf('?');
            if (q >= 0) {
                content.slice(q + 1).replace(cmdReg, cm => {
                    let cmd = refTmplCommands[cm];
                    if (cmd) {
                        cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                            tmplChecker.checkMxViewParamsEscape(o, toSrc(c), toSrc(m), content.slice(0, q), e);
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