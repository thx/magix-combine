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
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let slog = require('./util-log');
let util = require('util');
let chalk = require('chalk');
let tmplParser = require('./tmpl-parser');
let attrMap = require('./tmpl-attr-map');
let duAttrChecker = require('./checker-tmpl-duattr');
let sep = path.sep;
let uncheckTags = {
    'mx-view': 1,
    'mx-include': 1,
    'mx-vframe': 1
};
let cmdOutReg = /^<%([!=@])([\s\S]*)%>$/;
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let attrNameValueReg = /\s*([^=\/\s]+)\s*=\s*(["'])([\s\S]*?)\2\s*/g;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let tmplAttrsReg = /\$\{attrs\.([a-zA-Z_]+)\}/g;
let tmplContentReg = /\$\{content\}/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/;
let fileCache = Object.create(null);

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
    let tag = result.mainTag;
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
                    slog.ever(chalk.red('check attribute ' + key + '=' + q + oc + q), 'at', chalk.magenta(e.shortHTMLFile), 'the attribute value only support expression like ' + key + '="<%= data.' + key + ' %>" or ' + key + '="<%! data.' + key + ' %>" or ' + key + '="<%@ data.' + key + ' %>"');
                }
            } else {
                if (content === 'false' ||
                    content === '0' ||
                    content === '' ||
                    content === 'null') {
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
let innerView = (result, info, gRoot, map) => {
    if (util.isObject(info) && util.isFunction(info.processor)) {
        return info.processor(result, map) || '';
    } else if (util.isFunction(info)) {
        return info(result, map) || '';
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
        }
    }
    let allAttrs = attrMap.getAll(tag, type);
    let hasPath = false;
    attrs = attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (!info) {
            if (name == 'path' || name == 'view' || name == 'src') {
                hasPath = true;
                return ' mx-view=' + q + value + q;
            }
        }
        if (!allAttrs.hasOwnProperty(name) &&
            name.indexOf('view-') !== 0 &&
            name.indexOf('mx-') !== 0) {
            name = 'view-' + name;
        }
        return ' ' + name + '=' + q + value + q;
    });
    if (!hasPath && info) {
        attrs += ' mx-view="' + gRoot + info.path + '"';
    }
    return `<${tag} ${attrs}>${result.content}</${tag}>`;
};

let innerInclude = (result, info) => {
    let file = '';
    let attrs = {};
    result.attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (name == 'path' || name == 'src') {
            file = path.resolve(path.join(path.dirname(info.file) + sep + value));
        } else {
            attrs[name] = value;
        }
    });
    if (!fs.existsSync(file)) {
        slog.ever(chalk.red('can not find file:' + file), 'for tag', chalk.magenta('<mx-' + result.tag + '>'), 'at', chalk.magenta(info.shortHTMLFile));
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
            info.templateLang = path.extname(file).slice(1);
            content = configs.compileTmplStart(content, info);
            content = configs.compileTmplEnd(content, info);
        } catch (ex) {
            slog.ever(chalk.red('compile template error ' + ex.message), 'at', chalk.magenta(info.shortHTMLFile));
        }
        return content;
    }
};
module.exports = {
    process(tmpl, extInfo) {
        let badTags = Object.create(null);
        let cmdCache = Object.create(null);
        let galleriesMap = configs.galleries;
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
        let getTagInfo = n => {
            let content = '',
                attrs = '';
            if (n.hasAttrs) {
                attrs = tmpl.slice(n.attrsStart, n.attrsEnd);
            }
            if (n.hasContent) {
                content = tmpl.slice(n.contentStart, n.contentEnd);
            }
            let tag = n.tag;
            let oTag = tag;
            if (n.pfx) {
                tag = tag.slice(n.pfx.length + 1);
            }
            let tags = tag.split('.');
            let mainTag = tags.shift();
            let subTags = tags.length ? tags : ['index'];
            let result = {
                id: n.id,
                prefix: n.pfx,
                group: n.group,
                unary: !n.hasContent,
                tag: oTag,
                mainTag,
                subTags,
                attrs,
                attrsMap: n.attrsMap,
                content
            };
            return result;
        };

        let processCustomTag = (n, map) => {
            let result = getTagInfo(n);
            let content = result.content;
            let customContent = configs.customTagProcessor(result, map, extInfo);
            if (!customContent) {
                let tagName = result.tag;
                customContent = `<${tagName} ${result.attrs}>${content}</${tagName}>`;
                badTags[tagName] = 1;
            }
            if (content != customContent) {
                content = customContent;
                tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let processToNativeTag = n => {
            let result = getTagInfo(n);
            let content = result.content;
            content = toNative(result, cmdCache, extInfo);
            tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
            updateOffset(n.start, content.length - (n.end - n.start));
        };
        let processGalleryTag = (n, map) => {
            let result = getTagInfo(n);
            let content = result.content;
            let mainTag = n.pfx + (n.group ? '.' : '-') + result.mainTag;
            let hasGallery = galleriesMap.hasOwnProperty(n.pfx + 'Root');
            let gRoot = galleriesMap[n.pfx + 'Root'] || '';
            let gMap = galleriesMap[n.pfx + 'Map'] || {};
            //console.log(mainTag, hasGallery, result);
            if (!uncheckTags.hasOwnProperty(mainTag) && hasGallery) {
                if (gMap.hasOwnProperty(result.tag)) {
                    let i = gMap[result.tag];
                    if (i && !i.path) {
                        i.path = (n.group ? '' : n.pfx + '-') + result.mainTag + '/' + result.subTags.join('/');
                    }
                } else {
                    let cpath = path.join(configs.moduleIdRemovedPath, gRoot);
                    cpath = path.join(cpath, (n.group ? '' : n.pfx + '-') + result.mainTag);
                    if (fs.existsSync(cpath)) {
                        gMap[result.tag] = {
                            path: (n.group ? '' : n.pfx + '-') + result.mainTag + '/' + result.subTags.join('/')
                        };
                    } else {
                        uncheckTags[mainTag] = 1;
                        slog.ever(chalk.red('can not process tag: ' + result.tag), 'at', chalk.magenta(extInfo.shortHTMLFile));
                    }
                }
            }
            let update = false;
            if (n.pfx == 'mx') {
                if (result.mainTag == 'view' || result.mainTag == 'vframe') {
                    if (result.mainTag == 'view') {
                        slog.ever(chalk.red('deprecated tag: mx-view'), 'at', chalk.magenta(extInfo.shortHTMLFile), 'use', chalk.magenta('mx-vframe'), 'instead');
                    }
                    content = innerView(result);
                    update = true;
                } else if (result.tag == 'include') {
                    content = innerInclude(result, extInfo);
                    update = true;
                }
            }
            if (!update && gMap.hasOwnProperty(result.tag)) {
                content = innerView(result, gMap[result.tag], gRoot, map);
                update = true;
            }
            if (update) {
                tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let walk = (nodes, map) => {
            if (nodes) {
                if (!map) map = nodes.__map;
                for (let n of nodes) {
                    if (extInfo.checkTmplDuplicateAttr && n.attrs && n.attrs.length) {
                        duAttrChecker(n, extInfo, cmdCache, tmpl.slice(n.attrsStart, n.attrsEnd));
                    }
                    walk(n.children, map);
                    if (n.customTag) {
                        //console.log(configs.galleryPrefixes, n.pfx);
                        if (configs.galleryPrefixes[n.pfx] === 1) {
                            if (n.group && n.pfx == 'native') {
                                processToNativeTag(n);
                            } else {
                                processGalleryTag(n, map);
                            }
                        } else {
                            //slog.ever(chalk.red('can not process custom tag:' + n.tag), 'at', chalk.magenta(extInfo.shortHTMLFile));
                            processCustomTag(n, map);
                        }
                    }
                }
            }
        };
        let hasMxTag = nodes => {
            let map = nodes.__map;
            for (let n in map) {
                n = map[n];
                if (!badTags[n.tag] && n.customTag) {
                    return true;
                }
            }
            return false;
        };
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let tokens = tmplParser(tmpl);
        let checkTimes = 2 << 3;
        while (hasMxTag(tokens) && --checkTimes) {
            walk(tokens);
            tmpl = tmplCmd.store(tmpl, cmdCache);
            tmpl = tmplCmd.store(tmpl, cmdCache, configs.artTmplCommand);
            //console.log(tmpl);
            tokens = tmplParser(tmpl);
        }
        tmpl = tmplCmd.recover(tmpl, cmdCache);
        return tmpl;
    }
};