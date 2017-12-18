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
let duAttrChecker = require('./checker-tmpl-duattr');
let tmplTags = require('./tmpl-tags');
let sep = path.sep;
let uncheckTags = { view: 1, include: 1, native: 1, vframe: 1 };
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
    let tag = result.subTag;
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
    if (!hasTag && util.isObject(info)) {
        tag = info.tag;
    }
    let type = '';
    let mxTagRoot = configs.mxGalleriesRoot;
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        }
    }
    let allAttrs = attrMap.getAll(tag, type);
    let hasPath = false;
    attrs = attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (name == 'path' || name == 'view' || name == 'src') {
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
    return `<${tag} ${attrs}>${result.content}</${tag}>`;
};

let innerInclude = (result, info) => {
    let file = '';
    let attrs = {};
    result.attrs.replace(attrNameValueReg, (m, name, q, value) => {
        if (name == 'path') {
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
        let mxGalleriesMap = configs.mxGalleriesMap;
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
        let getTagInfo = (n, isMxTag) => {
            let content = '',
                attrs = '';
            if (n.hasAttrs) {
                attrs = tmpl.slice(n.attrsStart, n.attrsEnd);
            }
            if (n.hasContent) {
                content = tmpl.slice(n.contentStart, n.contentEnd);
            }
            let tag = n.tag;
            if (isMxTag) {
                tag = tag.slice(3);
            }
            let splitter = tag.indexOf('.') >= 0 ? '.' : '-';
            let tags = tag.split(splitter);
            if (splitter == '-' && tags.length > 1 && isMxTag) {
                slog.ever(chalk.red('deprecated tag: ' + n.tag), 'at', chalk.magenta(extInfo.shortHTMLFile), 'use', chalk.magenta('mx-' + tags.join('.')), 'instead');
            }
            let result = {
                isMxTag,
                unary: !n.hasContent,
                name: tag,
                tag,
                mainTag: tags.shift(),
                splitter,
                subTags: tags,
                subTag: tags.join(splitter),
                attrs,
                content
            };
            return result;
        };

        let processCustomTag = (n, isMxTag) => {
            let result = getTagInfo(n, isMxTag);
            attachMap(result);
            let content = result.content;
            let customContent = configs.customTagProcessor(result, extInfo);
            if (!customContent) {
                let tagName = (isMxTag ? 'mx-' : '') + result.tag;
                customContent = `<${tagName} ${result.attrs}>${content}</${tagName}>`;
                badTags[tagName] = 1;
            }
            if (content != customContent) {
                content = customContent;
                tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let processMxTag = n => {
            let result = getTagInfo(n, true);
            let content = result.content;
            //不能增加native tags的检测，因为组件有可能和native tag重名
            if (!uncheckTags.hasOwnProperty(result.mainTag) &&
                !mxGalleriesMap.hasOwnProperty(result.tag)) {
                let cpath = path.join(configs.moduleIdRemovedPath, configs.mxGalleriesRoot);
                cpath = path.join(cpath, 'mx-' + result.mainTag);
                if (fs.existsSync(cpath)) {
                    mxGalleriesMap[result.tag] = 'mx-' + result.mainTag + '/' + (result.subTag || 'index');
                } else {
                    uncheckTags[result.mainTag] = 1;
                }
            }
            let update = false;
            if (result.mainTag == 'view' || result.mainTag == 'vframe') {
                if (result.mainTag == 'view') {
                    slog.ever(chalk.red('deprecated tag: mx-view'), 'at', chalk.magenta(extInfo.shortHTMLFile), 'use', chalk.magenta('mx-vframe'), 'instead');
                }
                content = innerView(result);
                update = true;
            } else if (result.tag == 'include') {
                content = innerInclude(result, extInfo);
                update = true;
            } else if (result.mainTag == 'native') {
                content = toNative(result, cmdCache, extInfo);
                update = true;
            } else if (mxGalleriesMap.hasOwnProperty(result.tag)) {
                content = innerView(result, mxGalleriesMap[result.tag]);
                update = true;
            } else if (tmplTags.nativeTags.hasOwnProperty(result.tag)) {
                result.subTag = result.tag;
                content = toNative(result, cmdCache, extInfo);
                update = true;
            } else {
                processCustomTag(n, true);
            }
            if (update) {
                content = content;
                tmpl = tmpl.slice(0, n.start) + content + tmpl.slice(n.end);
                updateOffset(n.start, content.length - (n.end - n.start));
            }
        };
        let walk = nodes => {
            if (nodes) {
                for (let n of nodes) {
                    if (extInfo.checkTmplDuplicateAttr && n.attrs && n.attrs.length) {
                        duAttrChecker(n, extInfo, cmdCache, tmpl.slice(n.attrsStart, n.attrsEnd));
                    }
                    walk(n.children);
                    if (n.customTag) {
                        if (n.tag.indexOf('mx-') === 0) {
                            processMxTag(n);
                        } else {
                            processCustomTag(n, false);
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
            tokens = tmplParser(tmpl);
        }
        tmpl = tmplCmd.recover(tmpl, cmdCache);
        return tmpl;
    }
};