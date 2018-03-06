let HTMLParser = require('html-minifier/src/htmlparser').HTMLParser;
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
    new HTMLParser(input, {
        html5: true,
        start(tag, attrs, unary) {
            if (htmlFile && upperCaseReg.test(tag)) {
                slog.ever(chalk.red('avoid use ' + tag), 'at', chalk.magenta(htmlFile), 'use ', chalk.red(tag.toLowerCase()), 'instead');
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
            let token = {
                id: 't' + id++,
                tag,
                pfx,
                group: i != -1 && i == ip,
                attrs,
                attrsMap,
                hasContent: true,
                start: pos
            };
            tokensMap[token.id] = token;
            let parent = ctrls[ctrls.length - 1];
            if (parent) {
                if (!parent.children) {
                    parent.children = [];
                }
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
                } else if (temp == '_mxs') {
                    token.mxsKey = a.value;
                } else if (temp == '_mxa') {
                    token.mxsAttrKey = a.value;
                } else if (temp == 'mx-static' || temp == 'mxs') {
                    token.userStaticKey = a.value || true;
                } else if (temp.startsWith('@')) {
                    token.atAttr = true;
                }
                if (a.quote && a.value !== undefined) {
                    temp += '=' + a.quote + a.value + a.quote;
                    if (!tmplCommandAnchorReg.test(a.name)) {
                        attrsMap[a.name] = {
                            unary: false,
                            quote: a.quote,
                            value: a.value
                        };
                    }
                } else if (!tmplCommandAnchorReg.test(a.name)) {
                    attrsMap[a.name] = {
                        unary: true
                    };
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
                delete token.contentStart;
                delete token.hasContent;
            }
        },
        end(tag) {
            let token = ctrls.pop();
            token.contentEnd = pos;
            let temp = '</' + tag + '>';
            pos = input.indexOf(temp, pos) + temp.length;
            token.end = pos;
        },
        chars(text) {
            pos = input.indexOf(text, pos) + text.length;
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
    return tokens;
};