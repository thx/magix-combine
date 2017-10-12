/*
    增加mx-tag自定义标签的处理，方便开发者提取公用的html片断
 */
/*
    <mx-view path="app/views/default" pa="<%@a%>" pb="<%@b%>" />
    <mx-view path="app/views/default" pa="<%@a%>" pb="<%@b%>">
        loading...
    </mx-view>
 */
let fs = require('fs');
let path = require('path');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let slog = require('./util-log');
let util = require('util');
let chalk = require('chalk');
let tmplParser = require('./tmpl-parser');
let attrMap = require('./tmpl-attr-map');
let uncheckTags = { view: 1, include: 1, native: 1 };
let cmdOutReg = /<%([!=@])([\s\S]*)%>/;
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let attrNameValueReg = /\s*([^=\/\s]+)\s*=\s*(["'])([\s\S]*?)\2\s*/g;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let tmplAttrsReg = /\$\{attrs\.([a-zA-Z_]+)\}/g;
let tmplContentReg = /\$\{content\}/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let fileCache = Object.create(null);
let nativeTags = (() => {
    let tags = 'a,abbr,address,area,article,aside,audio,b,base,bdi,bdo,blockquote,body,br,button,canvas,caption,cite,code,col,colgroup,data,datalist,dd,del,details,dfn,dialog,div,dl,dt,em,embed,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,i,iframe,img,input,ins,kbd,keygen,label,legend,li,link,main,map,mark,menu,menuitem,meta,meter,nav,noscript,object,ol,optgroup,option,output,p,param,pre,progress,q,rb,rp,rt,rtc,ruby,s,samp,script,section,select,small,source,span,strong,style,sub,summary,sup,table,tbody,td,template,textarea,tfoot,th,thead,time,title,tr,track,u,ul,var,video,wbr'.split(',');
    let o = {};
    for (let tag of tags) {
        o[tag] = 1;
    }
    return o;
})();
let attachMap = result => {
    let aMap = {};
    result.attrs.replace(attrNameValueReg, (m, key, q, content) => {
        aMap[key] = content;
    });
    result.attrsMap = aMap;
    return result;
};
let toNative = (result, cmdStore, e) => {
    let attrs = result.attrs;
    let type = '';
    let tag = result.tag;
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        }
    }
    let bAttrs = attrMap.getBooleanProps(tag, type);
    let allAttrs = attrMap.getAll(tag, type);
    let hasPath = false;
    attrs = attrs.replace(attrNameValueReg, (m, key, q, content) => {
        if (key == 'path' ||
            key == 'view') {
            hasPath = true;
            return ' mx-view=' + q + content + q;
        }
        return m;
    });
    attrs = attrs.replace(attrNameValueReg, (m, key, q, content) => {
        if (bAttrs.hasOwnProperty(key)) {
            if (tmplCommandAnchorReg.test(content)) {
                let oc = tmplCmd.recover(content, cmdStore);
                let ocm = oc.match(cmdOutReg);
                if (ocm) {
                    return '<%if(' + ocm[2] + '){%> ' + key + ' <%}%>';
                } else {
                    slog.ever(chalk.red('check attribute ' + key + '=' + q + oc + q), 'at', chalk.magenta(e.shortHTMLFile));
                }
            } else {
                if (content === 'false' ||
                    content == '0' ||
                    content == '' ||
                    content == 'null') {
                    return '';
                } else {
                    return ' ' + key + ' ';
                }
            }
        } else if (!allAttrs.hasOwnProperty(key) &&
            key.indexOf('view-') !== 0 &&
            key.indexOf('mx-') !== 0 &&
            hasPath) {
            return ' view-' + key + '=' + q + content + q;
        }
        return m;
    });
    return `<${tag} ${attrs}>${result.content}</${tag}>`;
};
let innerView = (result, info) => {
    if (util.isObject(info) && util.isFunction(info.processor)) {
        attachMap(result);
        return info.processor(result);
    }
    let tag = 'div';
    let hasTag = false;
    let attrs = result.attrs.replace(tagReg, (m, t) => {
        tag = t;
        hasTag = true;
        return '';
    });
    let type = '';
    let mxTagRoot = configs.mxTagViewsRoot;
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        }
    }
    let allAttrs = attrMap.getAll(tag, type);
    let hasPath = false;
    attrs = attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (name == 'path' || name == 'view') {
            hasPath = true;
            return ' mx-view=' + q + value + q;
        }
        if (!allAttrs.hasOwnProperty(name) &&
            name.indexOf('view-') !== 0 &&
            name.indexOf('mx-') !== 0) {
            name = 'view-' + name;
        }
        return ' ' + name + '=' + q + value + q;
    });
    if (!hasPath && info) {
        attrs += ' mx-view="' + mxTagRoot + (util.isObject(info) ? info.path : info) + '"';
    }
    if (!hasTag && util.isObject(info)) {
        tag = info.tag;
    }
    return `<${tag} ${attrs}>${result.content}</${tag}>`;
};
let innerInclude = (result, info) => {
    let file = '';
    if (result.subTag) {
        let p = path.join(configs.moduleIdRemovedPath, configs.mxIncludesRoot, result.subTag);
        for (let ext of configs.tmplFileExtNames) {
            let t = p + '.' + ext;
            if (fs.existsSync(t)) {
                file = t;
                break;
            }
        }
    }
    let attrs = {};
    result.attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (name == 'path') {
            file = path.resolve(path.join(path.dirname(info.file) + path.sep + value));
        } else {
            attrs[name] = value;
        }
    });
    if (!path || !fs.existsSync(file)) {
        slog.ever(chalk.red('can not find file:' + file), 'for tag', chalk.magenta('<mx-' + result.tag + '>'), 'at', chalk.magenta(info.shortHTMLFile));
    } else {
        let content = '';
        if (fileCache[file]) {
            content = fileCache[file];
        } else {
            content = fs.readFileSync(file) + '';
            fileCache[file] = content;
        }
        content = content.replace(tmplAttrsReg, (m, key) => {
            return attrs[key] || '';
        }).replace(tmplContentReg, () => {
            return result.content;
        });
        try {
            content = configs.compileTmpl(content, info);
        } catch (ex) {
            slog.ever(chalk.red('compile template error ' + ex.message), 'at', chalk.magenta(info.shortHTMLFile), 'original content', content);
        }
        return content;
    }
    return '';
};
let innerNative = result => {
    return `<${result.subTag} ${result.attrs}></${result.subTag}>`;
};
module.exports = {
    process(tmpl, extInfo) {
        let cmdCache = Object.create(null);
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let restore = tmpl => tmplCmd.recover(tmpl, cmdCache);
        let tokens = tmplParser(tmpl);
        let mxTagViewsMap = configs.mxTagViewsMap;
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
                        let tags = tag.split('-');
                        let result = {
                            unary: !n.hasContent,
                            name: tag,
                            tag: tag,
                            mainTag: tags.shift(),
                            subTag: tags.join('-'),
                            attrs,
                            content
                        };
                        //不能增加native tags的检测，因为组件有可能和native tag重名
                        if (!uncheckTags.hasOwnProperty(result.mainTag) &&
                            !mxTagViewsMap.hasOwnProperty(result.tag)) {
                            let cpath = path.join(configs.moduleIdRemovedPath, configs.mxTagViewsRoot);
                            let parts = result.tag.split('-');
                            if (parts.length == 1) {
                                parts.push('index');
                            }
                            cpath = path.join(cpath, 'mx-' + parts[0]);
                            if (fs.existsSync(cpath)) {
                                mxTagViewsMap[result.tag] = 'mx-' + parts.shift() + '/' + parts.join('-');
                            } else {
                                uncheckTags[result.mainTag] = 1;
                            }
                        }
                        let update = false;
                        if (result.mainTag == 'view') {
                            content = innerView(result);
                            update = true;
                        } else if (result.mainTag == 'include') {
                            content = innerInclude(result, extInfo);
                            update = true;
                        } else if (result.mainTag == 'native') {
                            content = innerNative(result);
                            update = true;
                        } else if (mxTagViewsMap.hasOwnProperty(result.tag)) {
                            content = innerView(result, mxTagViewsMap[result.tag]);
                            update = true;
                        } else if (!nativeTags.hasOwnProperty(result.tag)) {
                            attachMap(result);
                            let tagContent = configs.mxTagProcessor(result, extInfo);
                            if (tagContent != content) {
                                content = tagContent;
                                update = true;
                            }
                        }
                        if (update) {
                            content = content || '';
                            tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                            updateOffset(n.start, content.length - (n.end - n.start));
                        }
                    }
                }
            }
        };
        walk(tokens);
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let walkToNative = nodes => {
            if (nodes) {
                for (let n of nodes) {
                    walkToNative(n.children);
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
                        content = toNative(result, cmdCache, extInfo);
                        content = content || '';
                        tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                        updateOffset(n.start, content.length - (n.end - n.start));
                    }
                }
            }
        };
        tokens = tmplParser(tmpl);
        walkToNative(tokens);
        tmpl = restore(tmpl);
        return tmpl;
    }
};