let htmlParser = require('./html-parser');
let tmplTags = require('./tmpl-tags');
let chalk = require('chalk');
let slog = require('./util-log');
let tmplCommandAnchorReg = /\u0007\d+\u0007/;
let upperCaseReg = /[A-Z]/g;
module.exports = (input, htmlFile) => {
    let ctrls = [];
    let pos = 0;
    let tokens = [];
    let id = 0;
    let tokensMap = Object.create(null);
    tokens.__map = tokensMap;
    htmlParser(input, {
        //html5: true,
        start(tag, attrs, unary) {
            if (htmlFile && upperCaseReg.test(tag)) {
                slog.ever(chalk.red('[MXC Tip(tmpl-parser)] avoid use ' + tag), 'at', chalk.magenta(htmlFile), 'use ', chalk.red(tag.toLowerCase()), 'instead');
            }
            tag = tag.toLowerCase();
            let ic = tag.indexOf('-');
            let ip = tag.indexOf('.');
            let i = -1;
            let pfx = '';
            if (ic != -1 || ip != -1) {
                if (ic != -1 && ip != -1) {
                    i = Math.min(ic, ip);
                } else if (ic != -1) {
                    i = ic;
                } else {
                    i = ip;
                }
            }
            if (i != -1) {
                pfx = tag.slice(0, i);
            }
            let attrsMap = Object.create(null);
            let attrsKV = Object.create(null);
            let token = {
                id: 't' + id++,
                tag,
                pfx,
                group: i != -1 && i == ip,
                attrs,
                attrsMap,
                attrsKV,
                childrenRange: [],
                hasContent: true,
                start: pos
            };
            tokensMap[token.id] = token;
            let parent = ctrls[ctrls.length - 1];
            if (parent) {
                if (!parent.children) {
                    parent.children = [];
                }
                if (parent.children.length) {
                    let prev = parent.children[parent.children.length - 1];
                    prev.lastElement = false;
                } else {
                    token.firstElement = true;
                }
                token.lastElement = true;
                parent.children.push(token);
                token.isChild = true;
                token.pId = parent.id;
            }
            ctrls.push(token);
            tokens.push(token);
            let temp = '<' + tag;
            pos = input.indexOf(temp, pos) + temp.length;
            for (let i = 0, len = attrs.length, a; i < len; i++) {
                if (i === 0) {
                    token.attrsStart = pos + (input.charAt(pos + 1) ? 0 : 1);
                }
                a = attrs[i];
                temp = a.name;
                if (temp == 'mx-guid') {
                    token.guid = a.value;
                } else if (temp == 'mx-view') {
                    token.hasMxView = true;
                    token.mxView = a.value;
                } else if (temp == '_mxs') {
                    token.mxsKey = a.value;
                } else if (temp == '_mxv') {
                    token.mxvAutoKey = a.value;
                } else if (temp == 'mxv') {
                    token.mxvKey = a.value;
                } else if (temp == 'mx-is') {
                    token.hasMxIs = true;
                } else if (temp == '_mxa') {
                    token.mxsAttrKey = a.value;
                } else if (temp === '_mxo') {
                    token.mxViewOwner = a.value;
                } else if (temp == 'mx-static' || temp == 'mxs') {
                    token.userStaticKey = a.value || true;
                } else if (temp == 'mx-static-attr' || temp == 'mxa') {
                    token.userStaticAttrKey = a.value || true;
                } else if (temp.startsWith('@')) {
                    token.atAttr = true;
                } else if (a.quote && a.value && a.value.indexOf('@') > -1) {
                    token.atAttrContent = true;
                }
                if (a.quote && a.value !== undefined) {
                    temp += '=' + a.quote + a.value + a.quote;
                    if (!tmplCommandAnchorReg.test(a.name)) {
                        attrsMap[a.name] = {
                            unary: false,
                            quote: a.quote,
                            value: a.value
                        };
                        attrsKV[a.name] = a.value;
                    }
                } else if (!tmplCommandAnchorReg.test(a.name)) {
                    attrsMap[a.name] = {
                        unary: true
                    };
                    attrsKV[a.name] = true;
                }
                pos = input.indexOf(temp, pos) + temp.length;
            }
            if (token.hasOwnProperty('attrsStart')) {
                token.attrsEnd = pos;
                token.hasAttrs = true;
            }
            pos = input.indexOf('>', pos) + 1;
            token.contentStart = pos;
            if (unary) {
                ctrls.pop();
                token.end = pos;
                let parent = ctrls[ctrls.length - 1];
                if (parent) {
                    parent.childrenRange.push({
                        start: token.start,
                        end: token.end
                    });
                }
                delete token.contentStart;
                delete token.hasContent;
            }
        },
        end(tag) {
            let token = ctrls.pop();
            if (token.tag !== tag) {
                throw new Error(`[MXC-Error(tmpl-parser)] "</${tag}>" unmatched tag "${token.tag}"`);
            }
            token.contentEnd = pos;
            let temp = '</' + tag + '>';
            pos = input.indexOf(temp, pos) + temp.length;
            token.end = pos;
            let parent = ctrls[ctrls.length - 1];
            if (parent) {
                parent.childrenRange.push({
                    start: token.start,
                    end: token.end
                });
            }
        },
        chars(text) {
            let parent = ctrls[ctrls.length - 1];
            let p = input.indexOf(text, pos);
            pos = p + text.length;
            if (parent && text.trim()) {
                parent.childrenRange.push({
                    start: p,
                    end: pos
                });
            }
        },
        comment(text) {
            pos = input.indexOf(text, pos) + text.length;
        }
    });
    for (let i = tokens.length, token; i--;) {
        token = tokens[i];
        if (token.isChild) {
            tokens.splice(i, 1);
        }
        if (token.hasMxView) {
            let pId = token.pId;
            while (pId) {
                let pToken = tokensMap[pId];
                if (pToken) {
                    pToken.hasSubView = true;
                    pId = pToken.pId;
                } else {
                    break;
                }
            }
        }
    }
    let walk = nodes => {
        if (nodes) {
            for (let n of nodes) {
                walk(n.children);
                if (!tmplTags.nativeTags.hasOwnProperty(n.tag) &&
                    !tmplTags.svgTags.hasOwnProperty(n.tag)) {
                    n.customTag = true;
                }
            }
        }
    };
    walk(tokens);
    if (tokens.length) {
        tokens[0].firstElement = true;
        tokens[tokens.length - 1].lastElement = true;
    }
    return tokens;
};