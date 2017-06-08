let atpath = require('./util-atpath');
let configs = require('./util-config');
let checker = require('./checker');
//let tmplCmd = require('./tmpl-cmd');

let tagReg = /<[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>/g;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
let viewAttrReg = /\bview-([\w\-]+)=(["'])([\s\S]*?)\2/g;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%([=!])([\s\S]+?)%>/g;

let htmlUnescapeMap = {
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    '#x27': '\'',
    '#x60': '`'
};
let htmlUnescapeReg = /&([^;]+?);/g;
let htmlUnescape = (m, name) => {
    return htmlUnescapeMap[name] || m;
};
let encodeMore = {
    '!': '%21',
    '\'': '%27',
    '(': '%28',
    ')': '%29',
    '*': '%2A'
};

//let escapeSlashRegExp = /\\|'/g;
//let mathcerReg = /<%([@=!])?([\s\S]+?)%>|$/g;
//let tmplCompiler = (text) => {
//    let index = 0;
//    let source = '\'';
//    text.replace(mathcerReg, (match, operate, content, offset) => {
//        source += text.slice(index, offset).replace(escapeSlashRegExp, '\\$&');
//        index = offset + match.length;
//        if (operate == '=' || operate == '@' || operate == '!') {
//            source += '\'+' + content + '+\'';
//        } else if (content) {
//            throw new Error('unsupport');
//        }
//        // Adobe VMs need the match returned to produce the correct offset.
//        return match;
//    });
//    source += '\'';
//    source = source.replace(/^\s*''\+/, '').replace(/\+''\s*$/, '');
//    return source;
//};

let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
let encodeMoreReg = /[!')(*]/g;
let encodeReplacor = (m) => {
    return encodeMore[m];
};
// http://mathiasbynens.be/notes/unquoted-attribute-values
//let canRemoveQuotesReg = /^[^ \t\n\f\r"'`=<>]+$/;
module.exports = {
    process(fileContent, e, refTmplCommands) {
        return fileContent.replace(tagReg, (match) => { //标签进入
            if (mxViewAttrReg.test(match)) { //带有mx-view属性才处理
                if (configs.useAtPathConverter) { //如果启用@路径转换规则
                    match = atpath.resolvePath(match, e.moduleId); //先把view对应的路径转换过来
                }
                if (viewAttrReg.test(match)) { //如果是view-开头的属性
                    //console.log(match);
                    let attrs = [];
                    match = match.replace(viewAttrReg, (m, name, q, content) => {
                        let cmdTemp = []; //处理属性中带命令的情况
                        let tmplChecker = checker.Tmpl;
                        if (tmplChecker.upperCaseReg.test(name)) {
                            tmplChecker.upperCaseReg.lastIndex = 0;
                            let hname = tmplChecker.hyphenate(name);
                            checker.Tmpl.markAttr(('avoid use view-' + name).red, 'at', e.shortHTMLFile.gray, 'use', ('view-' + hname).red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
                            name = hname;
                        }
                        name = tmplChecker.camelize(name);
                        content.replace(cmdReg, (cm) => {
                            cmdTemp.push(cm); //把命令暂存下来
                        });
                        let cs = content.split(cmdReg); //按命令拆分，则剩余的都是普通字符串
                        for (let i = 0; i < cs.length; i++) {
                            cs[i] = cs[i].replace(htmlUnescapeReg, htmlUnescape); //对转义字符回转一次，浏览器的行为，这里view-最终并不是标签属性，所以这里模拟浏览器的特性。
                            cs[i] = encodeURIComponent(cs[i]).replace(encodeMoreReg, encodeReplacor); //对这个普通字符串做转义处理
                            if (i < cmdTemp.length) { //把命令还原回去
                                cs[i] = cs[i] + cmdTemp[i];
                            }
                        }
                        content = cs.join('');
                        attrs.push(name + '=' + content); //处理成最终的a=b形式
                        // content = tmplCmd.recover(content, refTmplCommands);
                        // content = tmplCompiler(content);
                        // name = canRemoveQuotesReg.test(name) ? name : '\'' + name + '\'';
                        // attrs.push(name + ':' + content);
                        return '';
                    });
                    //attrs = '\u001ep=<%@{' + attrs.join(',') + '}%>';
                    //attrs = tmplCmd.store(attrs, refTmplCommands);
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
                let testCmd = (m, q, content) => {
                    q = content.indexOf('?');
                    if (q >= 0) {
                        content.slice(q + 1).replace(cmdReg, (cm) => {
                            let cmd = refTmplCommands[cm];
                            if (cmd) {
                                cmd = cmd.replace(dOutCmdReg, (m, o, c) => {
                                    if (o === '=') {
                                        m = m.replace(removeTempReg, '');
                                        let nc = c.replace(removeTempReg, '');
                                        checker.Tmpl.markAttr(('avoid use ' + m).red, 'at', e.shortHTMLFile.gray, 'near', ('mx-view="' + content.slice(0, q) + '"').magenta, 'use', ('<%!' + nc + '%>').red, 'or', ('<%@' + nc + '%>').red, 'instead');
                                    }
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
        });
    }
};