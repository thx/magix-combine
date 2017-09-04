/*
    增加mx-tag自定义标签的处理，方便开发者提取公用的html片断
 */
/*
    <mx-view @path="app/views/default" @pa="<%@a%>" @pb="<%@b%>" />
    <mx-view @path="app/views/default" @pa="<%@a%>" @pb="<%@b%>">
        loading...
    </mx-view>
 */
let attrKeyReg = /@([\w\-]+)(?=\s*=)/g;
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let tmplParser = require('./tmpl-parser');
let viewTag = tagInfo => {
    let viewsMap = configs.mxTagViewsMap;
    let hasMxView = false;
    let tag = 'div';
    let attrs = tagInfo.attrs.replace(tagReg, (m, t) => {
        tag = t;
        return '';
    });
    attrs = attrs.replace(attrKeyReg, (m, key) => {
        if (key == 'path') {
            hasMxView = true;
            return 'mx-view';
        }
        return 'view-' + key;
    });
    if (!hasMxView) {
        let view = viewsMap.hasOwnProperty(tagInfo.tag) && viewsMap[tagInfo.tag];
        if (view) {
            attrs += ` mx-view="${view}"`;
        }
    }
    return `<${tag} ${attrs}>${tagInfo.content}</${tag}>`;
};
module.exports = {
    process(tmpl, extInfo) {
        let cmdCache = Object.create(null);
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let restore = tmpl => tmplCmd.recover(tmpl, cmdCache);
        let tokens = tmplParser(tmpl);
        let updateOffset = (pos, offset) => {
            let l = nodes => {
                if (nodes) {
                    for (let n of nodes) {
                        l(n.children);
                        if (n.start > pos) {
                            n.start += offset;
                        }
                        if (n.end > pos) {
                            n.end += offset;
                        }
                        if (n.hasAttrs) {
                            if (n.attrsStart > pos) {
                                n.attrsStart += offset;
                            }
                            if (n.attrsEnd > pos) {
                                n.attrsEnd += offset;
                            }
                        }
                        if (n.hasContent) {
                            if (n.contentStart > pos) {
                                n.contentStart += offset;
                            }
                            if (n.contentEnd > pos) {
                                n.contentEnd += offset;
                            }
                        }
                    }
                }
            };
            l(tokens);
        };
        let walk = nodes => {
            if (nodes) {
                for (let n of nodes) {
                    walk(n.children);
                    if (n.tag.indexOf('mx-') === 0) {
                        let content = '',
                            attrs = '';
                        if (n.hasAttrs) {
                            attrs = tmpl.slice(n.attrsStart, n.attrsEnd);
                        }
                        if (n.hasContent) {
                            content = tmpl.slice(n.contentStart, n.contentEnd);
                        }
                        let tag = n.tag.slice(3);
                        let result = {
                            unary: !n.hasContent,
                            name: tag,
                            tag: tag,
                            attrs,
                            content
                        };
                        let has = configs.mxTagViewsMap.hasOwnProperty(result.tag);
                        if (result.tag == 'view' || has) {
                            content = viewTag(result, extInfo);
                        } else {
                            content = configs.mxTagProcessor(result, extInfo) || '';
                        }
                        tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                        updateOffset(n.start, content.length - (n.end - n.start));
                    }
                }
            }
        };
        walk(tokens);
        tmpl = restore(tmpl);
        return tmpl;
    }
};