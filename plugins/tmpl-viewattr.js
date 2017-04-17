let atpath = require('./util-atpath');
let configs = require('./util-config');

let tagReg = /<[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>/g;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]+?)\1/;
let viewAttrReg = /\bview-(\w+)=(["'])([\s\S]*?)\2/g;
let cmdReg = /\u0007\d+\u0007/g;

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
let encodeMoreReg = /[!')(*]/g;
let encodeReplacor = (m) => {
    return encodeMore[m];
};
module.exports = {
    process(fileContent, e) {
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
                        return '';
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
            }
            return match;
        });
    }
};