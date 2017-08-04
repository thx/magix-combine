/*
    给标签加上guid，用于局部刷新时的节点查找
 */
let tmplCmd = require('./tmpl-cmd');
//let regexp = require('./util-rcache');
let tmplParser = require('./tmpl-parser');
//模板，增加guid标识，仅针对magix-updater使用：https://github.com/thx/magix-updater
let tagReg = /<([^>\s\/]+)([^>]*?)(\/)?>/g;
//let keysTagReg = /<([\w]+)([^>]*?)mx-keys\s*=\s*"[^"]+"([^>]*?)>/g;
let holder = '\u001f';
//let slashReg = /\//g;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let mxViewAttrReg = /\bmx-view\b/;
//let subReg = (() => {
//    let temp = '<([^>\\s\\/]+)([^>]*?)>(#)</\\1>';
//    let start = 5; //嵌套9层在同一个view中也足够了
//    while (start--) {
//        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
//    }
//    temp = temp.replace('#', '[\\s\\S]*?');
//    return regexp.get(temp, 'ig');
//})();
//let subRegWithGuid = (() => {
//    let temp = '<([^>\\s\\/]+)(\\s+mx-guid="g[^"]+")([^>]*?)>(#)</\\1>';
//    let start = 5; //嵌套12层在同一个view中也足够了
//    while (start--) {
//        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
//    }
//    temp = temp.replace('#', '[\\s\\S]*?');
//    return regexp.get(temp, 'ig');
//})();
let guidReg = /\s+mx-guid="g[^"]+"/g;
//let selfCloseTagWithGuid = /<([^>\s\/]+)(\s+mx-guid="g[^"]+")([^>]*?)\/>/g;
//let selfCloseTag = /<[^>\s\/]+[^>]*?\/>/g;
//let emptyTag = /<(?:area|base|basefont|br|col|embed|frame|hr|img|input|isindex|keygen|link|meta|param|source|track|wbr)[^>]*?>/gi;
//let guidReg = /\s+mx-guid="g[^"]+"/g;
let vdReg = /\u0002(\w+)\b/g;
let idReg = /\u0001(\w+)\b/g;
let globalRegTest = /[\u0003\u0001]/;
let vdMatchId = (tmpl, tmplCommands) => {
    let c = tmplCmd.recover(tmpl, tmplCommands);
    if (!globalRegTest.test(c)) { //不存在全局的变量，不用局部刷新
        return false;
    }
    let vds = Object.create(null);
    let ids = Object.create(null);
    c.replace(vdReg, (m, key) => { //变量声明
        vds[key] = 1;
    });
    c.replace(idReg, (m, key) => { //变量使用
        ids[key] = 1;
    });
    let idKeys = Object.keys(ids);
    // if (!idKeys.length) {
    //     return false;
    // }
    for (let i = idKeys.length - 1; i >= 0; i--) {
        if (!vds[idKeys[i]]) { //如果使用的变量未在声明里，则表示当前区域是不完整的
            return false;
        }
    }
    return true;
};
let getContentExceptTags = (tmpl, nodes) => {
    for (let i = nodes.length; i--;) {
        let t = nodes[i];
        tmpl = tmpl.slice(0, t.start) + tmpl.slice(t.end);
    }
    return tmpl;
};
let getContentWithoutGuid = (n, tmpl) => {
    let removed = [{
        start: 0,
        end: n.contentStart
    }, {
        start: n.contentEnd,
        end: tmpl.length
    }];
    let walk = nodes => {
        if (nodes) {
            for (let n of nodes) {
                if (n.guid) {
                    removed.push(n);
                } else {
                    walk(n.children);
                }
            }
        }
    };
    walk(n.children);
    removed = removed.sort((a, b) => {
        return b.start - a.start;
    });
    for (let r of removed) {
        tmpl = tmpl.slice(0, r.start) + tmpl.slice(r.end);
    }
    return tmpl;
};
module.exports = {
    add(tmpl, tmplCommands, refLealGlobal) {
        let g = 0;
        let tokens = tmplParser(tmpl);
        //let r = tmpl.replace(selfCloseTag, '').replace(subReg, '');
        let r = getContentExceptTags(tmpl, tokens);

        //tmpl = tmpl.replace(emptyTag, match => {
        //    let content = match.slice(0, -1).trim();
        //    if (content.charAt(content.length - 1) != '/') {
        //        return content + '/>';
        //    }
        //    return match;
        //});
        if (tmplCommandAnchorRegTest.test(r)) {
            let cmd = tmplCmd.recover(r, tmplCommands);
            let addWrapper = globalRegTest.test(cmd) || vdReg.test(cmd);
            if (addWrapper) {
                tmpl = '<mxv-root>' + tmpl + '</mxv-root>';
            }
        }
        tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
            //if (close && !tmplCommandAnchorRegTest.test(match)) {
            //    tKey = '';
            //} else {
            tKey = ' mx-guid="g' + (g++).toString(16) + holder + '"';
            //}
            return '<' + tag + tKey + attrs + (close ? close : '') + '>';
        });
        //console.log(tmpl);
        tokens = tmplParser(tmpl);
        let getRemovedGuids = (tmpl) => {
            //如果移除子节点后无模板命令和属性中的模板命令，则移除guid
            //如果剩余内容+属性配对，则保留guid
            //如果剩余内容+属性不配对，则删除guid
            let removedGuids = [];
            let collectGuids = nodes => { //移除某个节点下的所有guid，用于mx-view这样的节点，子节点不能有guid
                if (nodes) {
                    for (let n of nodes) {
                        collectGuids(n.children);
                        if (n.guid) {
                            removedGuids.push(n.guid);
                            delete n.guid;
                        }
                    }
                }
            };
            let walk = nodes => {
                for (let n of nodes) {
                    let attrs = n.hasAttrs ? tmpl.slice(n.attrsStart, n.attrsEnd) : '';
                    if (n.hasContent) {
                        if (n.children) {
                            walk(n.children);
                        }
                        let content;
                        if (n.tag == 'textarea' || mxViewAttrReg.test(attrs)) { //mx-view特殊处理
                            collectGuids(n.children); //子节点不能有guid
                            content = tmpl.slice(n.contentStart, n.contentEnd);
                        } else {
                            //获取所有除了guid之外的节点内容
                            content = getContentWithoutGuid(n, tmpl);
                        }
                        if (!tmplCommandAnchorRegTest.test(content + attrs) || !vdMatchId(attrs + content, tmplCommands)) {
                            removedGuids.push(n.guid);
                            delete n.guid;
                        }
                    } else {
                        if (!tmplCommandAnchorRegTest.test(attrs) ||
                            !vdMatchId(attrs, tmplCommands)) {
                            removedGuids.push(n.guid);
                            delete n.guid;
                        }
                    }
                }
            };
            walk(tokens);
            return removedGuids;

            /*tmpl = tmpl.replace(selfCloseTagWithGuid, (match, tag, guid, attrs) => {
                //console.log(attrs,tmplCommandAnchorRegTest.test(attrs) , vdMatchId(attrs, tmplCommands));
                if (tmplCommandAnchorRegTest.test(attrs) && vdMatchId(attrs, tmplCommands)) {
                    guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                    return '<' + tag + guid + attrs + '/>';
                }
                return '<' + tag + attrs + '/>';
            });
            //console.log('tt',tmpl);
            tmpl = tmpl.replace(subRegWithGuid, (match, tag, guid, attrs, content) => {
                //attrs = attrs.replace(/\//g, '\u0004');
                //如果属性中有mx-view属性，则子节点不能独立的去局部刷新
                content = removeGuid(content, mxViewAttrReg.test(attrs)); //递归删除节点中的无用guid
                let tContent = content.replace(selfCloseTagWithGuid, '').replace(subRegWithGuid, ''); //tContent只有内容,不包含子节点
                if (tmplCommandAnchorRegTest.test(tContent + attrs) && vdMatchId(attrs + tContent, tmplCommands)) { //当前节点内容和属性中的变量匹配
                    ///console.log(attrs,tContent);
                    //attrs = attrs.replace(slashReg, '\u0004'); //把/换掉，防止在子模板分析中分析自闭合标签时不准确
                    //console.log('origin content',content,'---',tContent);
                    // let removeGuids = tContent.match(guidReg);
                    // if (removeGuids) {
                    //     removeGuids.forEach(g => {
                    //         content = content.replace(g, '');
                    //     });
                    // }
                    guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                    //console.log('removeGuids',removeGuids,tContent,content);
                    //console.log('m', content, 'x', tContent);
                    return '<' + tag + guid + attrs + '>' + content + '</' + tag + '>';
                }
                //tContent = content.replace(selfCloseTagWithGuid, '').replace(subRegWithGuid, '');
                //console.log(tContent, '----', match, '====', content);
                //if (tmplCommandAnchorRegTest.test(tContent) && vdMatchId(tContent, tmplCommands)) {
                //guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                //return '<' + tag + guid + attrs + '>' + content + '</' + tag + '>';
                //}
                return '<' + tag + attrs + '>' + content + '</' + tag + '>';
            });
            return tmpl;*/
        };
        let removedGuids = getRemovedGuids(tmpl);
        let checkTmpl = getContentWithoutGuid({
            children: tokens
        }, tmpl);
        for (let g of removedGuids) {
            tmpl = tmpl.replace(' mx-guid="' + g + '"', '');
        }
        g = 0;
        //重建guid
        tmpl = tmpl.replace(guidReg, () => {
            return ' mx-guid="g' + (g++).toString(16) + holder + '"';
        });
        checkTmpl = tmplCmd.recover(checkTmpl, tmplCommands);
        if (refLealGlobal) {
            refLealGlobal.exists = globalRegTest.test(checkTmpl);
        }
        //console.log(tmpl,tmplCommands);
        return tmpl;
    }
};