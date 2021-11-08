/*
    增加mx-tag自定义标签的处理，方便开发者提取公用的html片断
 */
/*
    <mx-vframe src="app/views/default" pa="{{@a}}" pb="{{@b}}" />
    <mx-vframe src="app/views/default" pa="{{@a}}" pb="{{@b}}">
        loading...
    </mx-vframe>
 */
let fs = require('fs');
let path = require('path');
let url = require('url');
let qs = require('querystring');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let slog = require('./util-log');
let util = require('util');
let chalk = require('chalk');
let tmplParser = require('./tmpl-parser');
let attrMap = require('./tmpl-attr-map');
let customConfig = require('./tmpl-customtag-cfg');
let duAttrChecker = require('./checker-tmpl-duattr');
let atpath = require('./util-atpath');
let consts = require('./util-const');
let sep = path.sep;
let cmdNumReg = /^\x07\d+$/;
let selfClose = require('./html-selfclose-tags');
let uncheckTags = {
    'mx-view': 1,
    'mx-include': 1,
    'mx-vframe': 1,
    'mx-link': 1,
    'mx-router': 1
};
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let attrNameValueReg = /(^|\s|\x07)([^=\/\s\x07]+)(?:\s*=\s*(["'])([\s\S]*?)\3)?/g;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let tmplAttrsReg = /\$\{attrs\.([a-zA-Z_]+)\}/g;
let tmplContentReg = /\$\{content\}/g;
let attrAtStartContentHolderReg = /\x03/g;
let mxViewAttrHolderReg = /\x02/g;
let atReg = /@/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]*?)\1/;
let fileCache = Object.create(null);
let processedGalleryInfo = Symbol('gallery.info.processed');

let valuableAttrReg = /\x07\d+\x07\s*\?\?\s*/;
let booleanAttrReg = /\x07\d+\x07\s*\?\s*/;

let isReservedAttr = key => {
    return key.startsWith('mx-') ||
        key.startsWith('data-') ||
        key.startsWith('native-') ||
        key.startsWith('#') ||
        key.startsWith('@native-') ||
        key.startsWith('@#');
};

let toNativeKey = key => {
    if (key.startsWith('native-')) {
        key = key.substring(7);
    } else if (key.startsWith('#')) {
        key = key.substring(1);
    } else if (key.startsWith('@native-')) {
        key = '@' + key.substring(8);
    } else if (key.startsWith('@#')) {
        key = '@' + key.substring(2);
    } else if (key.startsWith('#@')) {
        key = '@' + key.substring(2);
    }
    return key;
};

let toParamKey = (key, prefix) => {
    let c = prefix.length;
    if (key.startsWith(`@${prefix}-`)) {
        key = `${prefix}-@` + key.substring(c + 2);
    } else if (key.startsWith('@*')) {
        key = `${prefix}-@` + key.substring(2);
    } else if (key.startsWith('*@')) {
        key = `${prefix}-@` + key.substring(2);
    } else if (key.startsWith('*')) {
        key = `${prefix}-` + key.substring(1);
    } else if (!key.startsWith(prefix + '-')) {
        key = prefix + '-' + key;
    }
    return key;
};

let relativeReg = /\.{1,2}\//g;
let addAtIfNeed = tmpl => {
    return tmpl.replace(relativeReg, (m, offset, c) => {
        c = tmpl[offset - 1];
        if (c == '@' || c == '/') {
            return m;
        }
        return '@' + m;
    });
};
let splitAttrs = (tag, type, attrs) => {
    let viewAttrs = '';
    let viewAttrsMap = {};
    attrs = attrs.replace(tagReg, (m, t) => {
        tag = t;
        return '';
    });
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        }
    }
    let attrsMap = attrMap.getAll(tag, type);
    let aMap = Object.create(null);
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
        if (cmdNumReg.test(m)) {
            return m;
        }
        prefix = prefix || '';
        if (!attrsMap[key] && !isReservedAttr(key)) {
            key = toParamKey(key, 'view');
            if (q === undefined && !content) {
                q = '"';
                content = 'true';
            }
            viewAttrs += ' ' + key + '="' + content + '"';
            viewAttrsMap[key.substring(5)] = content;
            return '';
        } else {
            aMap[key] = content;
        }
        let tValue = (q === undefined && content === undefined) ? '' : `=${q}${content}${q}`;
        let nkey = toNativeKey(key);
        if (nkey != key) {
            return prefix + nkey + tValue;
        }
        return m;
    }).trim();
    viewAttrs = viewAttrs.trim();
    return {
        tag,
        unaryTag: selfClose.hasOwnProperty(tag),
        attrs,
        attrsMap: aMap,
        paramAttrs: viewAttrs,
        viewAttrs,
        paramAttrsMap: viewAttrsMap,
        viewAttrsMap
    };
};
let innerView = (result, info, gRoot, map, extInfo) => {
    if (info) {
        result.mxView = gRoot + info.path;
        result.seprateAttrs = (tag, type) => splitAttrs(info.tag || tag || 'div', type, result.attrs);
    }
    if (util.isObject(info) && util.isFunction(info.processor)) {
        return info.processor(result, map, extInfo) || '';
    }
    let tag = 'div';
    let hasTag = false;
    let attrs = result.attrs.replace(tagReg, (m, t) => {
        tag = t;
        hasTag = true;
        return '';
    });
    if (!hasTag && info && info.tag) {
        tag = info.tag;
    }
    let type = '';
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        } else if (info && info.type) {
            type = info.type;
        }
    }
    let allAttrs = attrMap.getAll(tag, type);
    let hasPath = false;
    let processedAttrs = {};
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (cmdNumReg.test(m)) {
            return m;
        }
        prefix = prefix || '';
        if (!info) {
            if (key == 'path' || key == 'view' || key == 'src') {
                hasPath = true;
                return prefix + 'mx-view=' + q + value + q;
            }
        }
        let viewKey = false;
        let originalKey = key;
        if (!allAttrs.hasOwnProperty(key) && !isReservedAttr(key)) {
            key = toParamKey(key, 'view');
            viewKey = true;
        } else {
            key = toNativeKey(key);
        }
        //处理其它属性
        if (info) {
            let pKey = '_' + originalKey;
            if (info[originalKey]) {//如果配置中允许覆盖，则标记已经处理过
                processedAttrs[originalKey] = 1;
            } else if (info[pKey]) {//如果配置中追加
                processedAttrs[pKey] = 1;//标记处理过
                if (q === undefined &&
                    value === undefined) {//对于unary的我们要特殊处理下
                    q = '"';
                    value = '';
                }
                value += info[pKey];
            }
        }
        if (q === undefined && viewKey) {
            q = '"';
            value = 'true';
        }
        return prefix + key + (q === undefined && !viewKey ? '' : '=' + q + value + q);
    });
    if (info) {
        for (let p in info) {
            if (p != 'path' && p != 'tag' && !processedAttrs[p]) {
                let v = info[p];
                if (p.startsWith('_')) {
                    p = p.slice(1);
                } else if (!allAttrs.hasOwnProperty(p) && !isReservedAttr(p)) {
                    p = toParamKey(p, 'view');
                } else {
                    p = toNativeKey(p);
                }
                attrs += ` ${p}="${v}"`;
            }
        }
    }
    if (!hasPath && info) {
        attrs += ' mx-view="' + result.mxView + '"';
    }

    let html = `<${tag} ${attrs}`;
    let unary = selfClose.hasOwnProperty(tag);
    if (unary) {
        html += `/>`;
    } else {
        html += `>${result.content}`;
        html += `</${tag}>`;
    }
    return html;
};
let innerLink = (result) => {
    let tag = 'a';
    let href = '', paramKey = 0;
    let attrs = result.attrs;
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (cmdNumReg.test(m)) {
            return m;
        }
        if (key == 'to' || key == 'href') {
            href = value;
            return '';
        }
        if (key == 'tag') {
            tag = value;
            return '';
        }
        return m;
    });
    let allAttrs = attrMap.getAll(tag);
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (cmdNumReg.test(m)) {
            return m;
        }
        prefix = prefix || '';
        if (!allAttrs.hasOwnProperty(key) && !isReservedAttr(key)) {
            key = toParamKey(key, 'param');
            paramKey = 1;
        } else {
            key = toNativeKey(key);
        }
        if (q === undefined && paramKey) {
            q = '"';
            value = '';
        }
        return prefix + key + '=' + q + value + q;
    });
    let html = `<${tag} href="${href}" ${attrs}`;
    let unary = selfClose.hasOwnProperty(tag);
    if (unary) {
        html += `/>`;
    } else {
        html += `>${result.content}`;
        html += `</${tag}>`;
    }
    return html;
};
let innerInclude = (result, info) => {
    let file = '';
    let attrs = {};
    let src = '';
    result.attrs.replace(attrNameValueReg, (m, prefix, name, q, value) => {
        if (name == 'path' || name == 'src') {
            src = m;
            file = path.resolve(path.join(path.dirname(info.srcOwnerHTMLFile) + sep + value));
        } else {
            attrs[name] = value;
        }
    });
    if (!fs.existsSync(file)) {
        slog.ever(chalk.red('[MXC Error(tmpl-customtag)] can not find file:' + file), 'for tag', chalk.magenta('<' + result.tag + ' ' + src + '>'), 'at', chalk.magenta(info.shortOwnerHTMLFile));
        return '';
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
            info.templateLang = path.extname(file).substring(1);
            info.srcHTMLFile = file;
            info.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').substring(1);
            info.includeSnippet = true;
            content = configs.compileTmplStart(content, info);
            content = configs.compileTmplEnd(content, info);
        } catch (ex) {
            slog.ever(chalk.red('[MXC Error(tmpl-customtag)] compile template error ' + ex.message), 'at', chalk.magenta(info.shortHTMLFile));
        }
        return content;
    }
};
module.exports = {
    process(tmpl, extInfo, e) {
        let badTags = Object.create(null);
        let cmdCache = Object.create(null);
        let tempSkipTags = Object.create(null);
        let galleriesMap = configs.galleries;
        e.tmplComponents = [];
        let updateOffset = (pos, offset) => {
            let l = nodes => {
                //debugger;
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
        let getTagInfo = (n, map) => {
            let content = '',
                attrs = '',
                children = [];
            //console.log(tmpl,n);
            if (n.hasAttrs) {
                attrs = tmpl.substring(n.attrsStart, n.attrsEnd);
            }
            if (n.hasContent) {
                content = tmpl.substring(n.contentStart, n.contentEnd);
            }
            if (n.children) {
                for (let r of n.children) {
                    let i = Object.assign({}, r);
                    i.html = tmpl.substring(i.start, i.end);
                    children.push(i);
                }
            }
            let tag = n.tag;
            let oTag = tag;
            if (n.pfx) {
                tag = tag.substring(n.pfx.length + 1);
            }
            let tags = tag.split('.');
            let mainTag = tags.shift();
            //console.log(tags);
            let subTags = tags.length ? tags : ['index'];
            let result = {
                id: n.id,
                pId: n.pId,
                prefix: n.pfx,
                group: n.group,
                unary: !n.hasContent,
                tag: oTag,
                mainTag,
                subTags,
                attrs,
                nodesMap: map,
                firstElement: n.firstElement,
                lastElement: n.lastElement,
                attrsKV: n.attrsKV,
                attrsMap: n.attrsMap,
                content,
                children
            };
            //console.log(result);
            return result;
        };

        let processCustomTag = (n, map) => {
            let result = getTagInfo(n, map);
            if (configs.components[n.pfx + 'Root']) {
                tempSkipTags[result.tag] = 1;
                let jsFile = configs.components[n.pfx + 'Root'] + result.tag;
                e.tmplComponents.push(jsFile);
            } else {
                let content = result.content;
                let fn = galleriesMap[result.tag] || configs.customTagProcessor;
                let customContent = fn(result, map, extInfo, e);
                if (!customContent) {
                    let tagName = result.tag;
                    customContent = `<${tagName} ${result.attrs}>${content}</${tagName}>`;
                    badTags[tagName] = 1;
                }
                if (content != customContent) {
                    content = customContent;
                    tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                    updateOffset(n.start, content.length - (n.end - n.start));
                }
            }
        };
        let processGalleryTag = (n, map) => {
            let result = getTagInfo(n, map);
            let content = result.content;
            let hasGallery = galleriesMap.hasOwnProperty(n.pfx + 'Root');
            let gRoot = galleriesMap[n.pfx + 'Root'] || '';
            let gMap = galleriesMap[n.pfx + 'Map'] || {};
            if (!uncheckTags.hasOwnProperty(result.tag)) {
                let vpath = (n.group ? '' : n.pfx + '-') + result.mainTag;
                if (result.subTags.length) {
                    vpath += '/' + result.subTags.join('/');
                }
                if (hasGallery) {
                    let i = gMap[result.tag];
                    if ((!i || !i[processedGalleryInfo]) && !util.isFunction(i)) {
                        let subs = result.subTags.slice(0, -1);
                        if (subs.length) {
                            subs = subs.join(sep);
                        } else {
                            subs = '';
                        }
                        let main = (n.group ? '' : n.pfx + '-') + result.mainTag;
                        let cpath = path.join(configs.moduleIdRemovedPath, gRoot, main, subs);
                        if (fs.existsSync(cpath)) {
                            let cfg = customConfig(cpath, main);
                            if (cfg.hasOwnProperty(result.tag)) {
                                gMap[result.tag] = cfg[result.tag];
                            } else if (!i) {
                                gMap[result.tag] = {
                                    path: vpath
                                };
                            }
                        } else {
                            //当文件不存在时，不检查，直接使用用户配置的路径
                            gMap[result.tag] = Object.assign({}, i, {
                                path: vpath
                            });
                            /*uncheckTags[result.tag] = {
                                resolve: cpath + sep,
                                msg: 'folder not found. try path'
                            };*/
                        }
                    }
                } else {
                    uncheckTags[result.tag] = {
                        resolve: `${n.pfx}Root or ${n.pfx}Map`,
                        msg: 'missing config galleries'
                    };
                }
                if (gMap.hasOwnProperty(result.tag)) {
                    let i = gMap[result.tag];
                    if (!i[processedGalleryInfo]) {
                        if (util.isFunction(i)) {
                            i = {
                                processor: i
                            };
                            gMap[result.tag] = i;
                        }
                        if (!i.path) {
                            i.path = vpath;
                        }
                        i[processedGalleryInfo] = 1;
                    }
                }
            }
            let tip = uncheckTags[result.tag];
            if (tip && tip !== 1) {
                slog.ever(chalk.red('[MXC Error(tmpl-custom)] can not process tag: ' + result.tag), 'at', chalk.magenta(e.shortHTMLFile), tip.msg, chalk.magenta(tip.resolve));
            }
            let update = false;
            if (n.pfx == 'mx') {
                if (result.mainTag == 'view' || result.mainTag == 'vframe') {
                    if (result.mainTag == 'view') {
                        slog.ever(chalk.red('[MXC Tip(tmpl-custom)] deprecated tag: mx-view'), 'at', chalk.magenta(e.shortHTMLFile), 'use', chalk.magenta('mx-vframe'), 'instead');
                    }
                    content = innerView(result);
                    update = true;
                } else if (result.mainTag == 'include') {
                    content = innerInclude(result, extInfo);
                    update = true;
                } else if (result.mainTag == 'link' ||
                    result.mainTag == 'router') {
                    content = innerLink(result, extInfo);
                    update = true;
                }
            }
            if (!update && gMap.hasOwnProperty(result.tag)) {
                content = innerView(result, gMap[result.tag], gRoot, map, extInfo);
                update = true;
            }
            if (update) {
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let processAtAttrs = n => {
            let result = getTagInfo(n);
            let update = false;
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            let inputType = n.attrsMap.type;
            if (inputType) {
                inputType = inputType.value;
            }
            let bProps = attrMap.getBooleanProps(n.tag, inputType);
            attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
                if (cmdNumReg.test(m)) {
                    return m;
                }
                prefix = prefix || '';
                if (key.startsWith('@')) {
                    if (key.startsWith('@@')) {
                        update = true;
                        m = prefix + '\x03' + key.substring(2) + (q ? '=' + q + content + q : '');
                    } else if (tmplCommandAnchorReg.test(content)) {
                        key = key.substring(1);
                        let cmdContent = tmplCmd.extractCmdContent(content, cmdCache);
                        //console.log(cmdContent);
                        if (cmdContent.succeed) {
                            update = true;
                            m = m.trim().substring(1);
                            let art = '', operate = cmdContent.operate || '';
                            let isBooleanProp = bProps[key] === 1;
                            if (cmdContent.isArt) {
                                art = `<%'${cmdContent.line}\x11${cmdContent.art}\x11'%>`;
                            }
                            if (configs.magixUpdaterQuick) {
                                operate = tmplCmd.operatesMap[operate] || '';
                                let out = isBooleanProp ? `(${cmdContent.content})?true:null` : operate + cmdContent.content;
                                return `${prefix}${key}="${art}<%${out}%>"`;
                            }
                            let out = isBooleanProp ? key : `${key}="<%${operate}$_temp%>"`;
                            return `${prefix}${art}<%if(($_temp=${cmdContent.content})){%>${out}<%}%> `;
                        } else {
                            let ex0 = cmdContent.isArt ? `{{data.${key}}}` : `<%data.${key}%>`;
                            let ex1 = cmdContent.isArt ? `{{=data.${key}}}` : `<%=data.${key}%>`;
                            let ex2 = cmdContent.isArt ? `{{!data.${key}}}` : `<%!data.${key}%>`;
                            let ex3 = cmdContent.isArt ? `{{@data.${key}}}` : `<%@data.${key}%>`;
                            slog.ever(chalk.red('[MXC Tip(tmpl-custom)] check attribute ' + key + '=' + q + cmdContent.origin + q), 'at', chalk.magenta(e.shortHTMLFile), 'the attribute value only support expression like ' + key + '="' + ex0 + '" or ' + key + '="' + ex1 + '" or ' + key + '="' + ex2 + '" or ' + key + '="' + ex3 + '"');
                        }
                    } else if (content === 'false' ||
                        content === '0' ||
                        content === '' ||
                        content === 'null') {
                        update = true;
                        m = prefix;
                    } else {
                        update = true;
                        m = prefix + key.substring(1) + (q ? ('=' + q + content + q) : '');
                    }
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = selfClose.hasOwnProperty(tag);
                if (unary) {
                    html += `/`;
                }
                html += `>${result.content}`;
                if (!unary) {
                    html += `</${tag}>`;
                }
                content = html;
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let processAtAttrContents = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, m => {
                return atpath.resolveContent(m, e.moduleId, '\x03')
                    .replace(atReg, '\x03');
            });
            let html = `<${tag} ${attrs}`;
            let unary = selfClose.hasOwnProperty(tag);
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n.start, content.length - (n.end - n.start));
        };
        let processEncodeAttr = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            let entities = {
                '>': '&gt;',
                '<': '&lt;'
            };
            let encodeEntities = m => m.replace(/[<>]/g, _ => entities[_]);
            attrs = attrs.replace(attrNameValueReg, encodeEntities);
            let html = `<${tag} ${attrs}`;
            let unary = selfClose.hasOwnProperty(tag);
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n.start, content.length - (n.end - n.start));
        };
        let processMxView = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            if (configs.useAtPathConverter) { //如果启用@路径转换规则
                attrs = attrs.replace(mxViewAttrReg, (m, q, c) => {
                    let { pathname, query } = url.parse(c);
                    pathname = pathname || '';
                    pathname = addAtIfNeed(pathname);
                    pathname = atpath.resolveContent(pathname, e.moduleId);
                    let params = [];
                    query = qs.parse(query, '&', '=', {
                        decodeURIComponent(v) {
                            return v;
                        }
                    });
                    for (let p in query) {
                        let v = query[p];
                        v = addAtIfNeed(v);
                        params.push(`${p}=${v}`);
                    }
                    pathname = configs.mxViewProcessor({
                        path: pathname,
                        pkgName: e.pkgName
                    }, e) || pathname;
                    let view = pathname;
                    if (params.length) {
                        view += `?${params.join('&')}`;
                    }
                    return `\x02="${view}"`;
                });
            }
            let html = `<${tag} ${attrs}`;
            let unary = selfClose.hasOwnProperty(tag);
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n.start, content.length - (n.end - n.start));
        };
        let processCondAttrs = n => {
            let result = getTagInfo(n);
            let update = false;
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
                prefix = prefix || '';
                let valuable = valuableAttrReg.test(content);
                let boolean = !valuable && booleanAttrReg.test(content);
                if (valuable || boolean) {
                    let cs = content.split(valuable ? '??' : '?');
                    let [cond, ext] = cs;
                    //console.log(cond,ext,tmplCmd.recover(content,cmdCache));
                    update = true;
                    cond = cond.trim();
                    ext = ext.trim();
                    let extract = tmplCmd.extractCmdContent(cond.trim(), cmdCache);
                    if (extract.operate == '@' &&
                        !key.startsWith(htmlAttrParamPrefix)) {
                        console.log(chalk.red('[MXC Tip(tmpl-custom)] ? or ?? only support "=" at attr ' + key), 'at', chalk.magenta(e.shortHTMLFile));
                    }
                    if (!extract.succeed) {
                        console.log(chalk.red('[MXC Tip(tmpl-custom)] check condition ' + tmplCmd.recover(cond, cmdCache)), 'at', chalk.magenta(e.shortHTMLFile));
                    }
                    let trimedKey = key.trim();
                    if (trimedKey.startsWith('*') ||
                        trimedKey.startsWith('view-')) {
                        if (trimedKey.startsWith('*')) {
                            trimedKey = 'view-' + trimedKey.substring(1);
                        }
                        let ifCond = '';
                        if (ext) {
                            ifCond = `<%if((${extract.content})${valuable ? '!=null' : ''}){%>${ext}<%}%>`;
                        } else {
                            ifCond = `<%if((${extract.content})${valuable ? '!=null' : ''}){%>${cond}<%}%>`;
                        }
                        return ` ${trimedKey}="${ifCond}"`;
                    } else {
                        if (ext) {
                            return `<%if((${extract.content})${valuable ? '!=null' : ''}){%> ${key}="${ext}"<%}%>`;
                        } else {
                            return `<%if((${extract.content})${valuable ? '!=null' : ''}){%> ${key}<%}%>`;
                        }
                    }
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = result.unary;
                if (unary) {
                    html += `/`;
                }
                html += `>${result.content}`;
                if (!unary) {
                    html += `</${tag}>`;
                }
                content = html;
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let walk = (nodes, map) => {
            if (nodes) {
                if (!map) map = nodes.__map;
                for (let n of nodes) {
                    if (configs.debug &&
                        e.checker.checkTmplDuplicateAttr &&
                        n.attrs &&
                        n.attrs.length) {
                        duAttrChecker(n, e, cmdCache, tmpl.substring(n.attrsStart, n.attrsEnd));
                    }
                    walk(n.children, map);
                    if (n.needEncodeAttr) {
                        processEncodeAttr(n, map);
                    } else if (n.customTag) {
                        if (configs.galleryPrefixes[n.pfx] === 1) {
                            processGalleryTag(n, map);
                        } else {
                            processCustomTag(n, map);
                        }
                    } else if (n.atAttr) {
                        processAtAttrs(n);
                    } else if (n.condAttr) {
                        processCondAttrs(n);
                    } else if (n.atAttrContent) {
                        processAtAttrContents(n);
                    } else if (n.hasMxView) {
                        processMxView(n);
                    }
                }
            }
        };
        let hasSpecialTags = nodes => {
            let map = nodes.__map;
            for (let n in map) {
                n = map[n];
                if (!badTags[n.tag] &&
                    !tempSkipTags[n.tag]) {
                    if (n.customTag ||
                        n.needEncodeAttr ||
                        n.atAttr ||
                        n.atAttrContent ||
                        n.condAttr ||
                        n.hasMxView) {
                        return true;
                    }
                }
            }
            return false;
        };
        //debugger;
        tmpl = tmplCmd.store(tmpl, cmdCache);
        tmpl = tmplCmd.store(tmpl, cmdCache, consts.artCommandReg);
        let tokens = tmplParser(tmpl, e.shortHTMLFile);
        let checkTimes = 2 << 2;
        while (hasSpecialTags(tokens) &&
            --checkTimes) {
            walk(tokens);
            tmpl = tmplCmd.store(tmpl, cmdCache);
            tmpl = tmplCmd.store(tmpl, cmdCache, consts.artCommandReg);
            tokens = tmplParser(tmpl, e.shortHTMLFile);
        }
        tmpl = tmplCmd.recover(tmpl, cmdCache);
        tmpl = tmpl.replace(attrAtStartContentHolderReg, '@');
        tmpl = tmpl.replace(mxViewAttrHolderReg, 'mx-view');
        //console.log('out', tmpl);
        return tmpl;
    }
};