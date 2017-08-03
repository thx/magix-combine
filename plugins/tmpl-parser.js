let HTMLParser = require('html-minifier/src/htmlparser').HTMLParser;
module.exports = input => {
    let ctrls = [];
    let pos = 0;
    let tokens = [];
    new HTMLParser(input, {
        html5: true,
        start(tag, attrs, unary) {
            let token = {
                tag,
                hasContent: true,
                start: pos
            };
            let parent = ctrls[ctrls.length - 1];
            if (parent) {
                if (!parent.children) {
                    parent.children = [];
                }
                parent.children.push(token);
                token.isChild = true;
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
                }
                if (a.quote && a.value) {
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
        }
    });
    for (let i = tokens.length; i--;) {
        if (tokens[i].isChild) {
            tokens.splice(i, 1);
        }
    }
    return tokens;
};