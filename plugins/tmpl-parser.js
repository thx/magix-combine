let HTMLParser = require('html-minifier/src/htmlparser').HTMLParser;
let tmplTags = require('./tmpl-tags');
module.exports = input => {
    let ctrls = [];
    let pos = 0;
    let tokens = [];
    let id = 0;
    let tokensMap = Object.create(null);
    tokens.__map = tokensMap;
    new HTMLParser(input, {
        html5: true,
        start(tag, attrs, unary) {
            tag = tag.toLowerCase();
            let token = {
                id: 't' + id++,
                tag,
                attrs,
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
                if (i === 0) token.attrsStart = pos + 1;
                a = attrs[i];
                temp = a.name;
                if (temp == 'mx-guid') {
                    token.guid = a.value;
                } else if (temp == 'mx-view') {
                    token.hasMxView = true;
                }
                if (a.quote && a.value !== undefined) {
                    temp += '=' + a.quote + a.value + a.quote;
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
    let walk = (nodes, inSVG) => {
        if (nodes) {
            for (let n of nodes) {
                if (n.tag == 'svg') inSVG = true;
                walk(n.children, inSVG);
                if (!tmplTags.nativeTags.hasOwnProperty(n.tag) &&
                    (!inSVG || !tmplTags.svgTags.hasOwnProperty(n.tag))) {
                    n.customTag = true;
                }
                if (n.tag == 'svg') inSVG = false;
            }
        }
    };
    walk(tokens);
    return tokens;
};