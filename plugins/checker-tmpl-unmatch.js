//https://github.com/marcosbasualdo/UnclosedHtmlTags/blob/master/index.js

//let chalk = require('chalk');
//let slog = require('./util-log');
let configs = require('./util-config');
//let tmplCmd = require('./tmpl-cmd');
let commentReg = /<!--[\s\S]*?-->/g;
let tagRemovedReg = /<(style|script)[^>]*>[\s\S]*?<\/\1>/g;
let tagReg = /<(\/)?([a-z0-9\-.:_\x11]+)[^>]*>?/ig;
let brReg = /(?:\r\n|\r|\n)/;
let consts = require('./util-const');
let selfCloseTags = require('./html-selfclose-tags');
let hdreg = /\x1f\d+\s*\x1f/g;
let brPlaceholder = (m, store) => {
    let count = m.split(brReg).length;
    let key = `\x1f${++store.__idx}${new Array(count).join('\n')}\x1f`;
    store[key] = m;
    return key;
};
let cleanHTML = (tmpl, store) => {
    tmpl = tmpl.replace(commentReg, m => {
        return brPlaceholder(m, store);
    }).replace(tagRemovedReg, m => {
        return brPlaceholder(m, store);
    });
    //let store = Object.create(null);
    //tmpl = tmplCmd.store(tmpl, store);
    //tmpl = tmpl.replace(/(?:>[\s\S]+?<|^[\s\S]+?<|>[\s\S]+?$)/g, m => tmplCmd.recover(m, store));
    /*tmpl = tmpl.replace(consts.artCtrlsReg, (m, key) => {
        let closed = key.startsWith('/');
        if (closed) {
            key = key.substring(1);
        }
        return `<${closed ? '/' : ''}art\x11${key.trim()}>`;
    })*/
    tmpl = tmpl.replace(consts.microTmplCommand, m => {
        return brPlaceholder(m, store);
    });
    if (configs.tmplCommand) {
        tmpl = tmpl.replace(configs.tmplCommand, m => {
            return brPlaceholder(m, store);
        });
    }
    return tmpl;
};

module.exports = (tmpl, e) => {
    let store = Object.create(null);
    store.__idx = 0;
    tmpl = cleanHTML(tmpl, store);
    let tags = [];
    let lines = tmpl.split(brReg);
    let lineCount = 1;
    let isClosed = (currentLine, offset) => {
        let i = currentLine.indexOf('>', offset),
            closed = false, results = [];
        if (i == -1) {
            let start = lineCount;
            while (start < lines.length) {//从当前行向后查找'>'结束
                let current = lines[start++];
                i = current.indexOf('>');
                if (i > -1) {
                    results.push(current.substring(0, i));
                    break;
                } else {
                    results.push(current);
                }
            }
        } else {
            results.push(currentLine.substring(offset, i));
        }
        let near = results.join('');//当前标签的片断
        let found = null;
        i = near.length;
        while (i) {//从后向前查'/'自闭合
            found = near.charAt(--i);
            if (found == '/') {
                closed = true;
                break;
            }
            if (found.trim()) {
                break;
            }
        }
        return closed;
    };
    for (let line of lines) {
        line.replace(tagReg, (m, close, name, offset) => {
            if (selfCloseTags.hasOwnProperty(name)) {
                // close = isClosed(line, offset);
                // if (!close) {
                //     slog.ever(chalk.red('tag ' + name + ' recommand closed at line: ' + lineCount), 'at file', chalk.magenta(e.shortHTMLFile));
                // }
                return;
            }
            let check = true;
            if (!close) {
                close = isClosed(line, offset);
                if (close) {
                    check = false;
                }
            }
            if (check) {
                tags.push({
                    line: lineCount,
                    close: !!close,
                    match: m,
                    name: name
                });
            }
        });
        lineCount++;
    }
    let tagsStack = [];
    let recover = str => str.replace(hdreg, m => store[m]);
    for (let tag of tags) {
        if (tag.close) {
            if (!tagsStack.length) {
                throw new Error(`[MXC Error(checker-tmpl-unmatch)] ${recover(tag.match)} doesn't have corresponding open tag at line  ${tag.line}`);
            }
            let last = tagsStack.pop();
            if (tag.name != last.name) {
                let before = `open tag ${recover(last.match)}`;
                if (last.name.startsWith('art\x11')) {
                    before = `art "${last.close ? '/' : ''}${last.name.substring(4)}"`;
                }
                let current = recover(tag.match);
                if (tag.name.startsWith('art\x11')) {
                    current = `art "${tag.close ? '/' : ''}${tag.name.substring(4)}"`;
                }
                throw new Error(`[MXC Error(checker-tmpl-unmatch)] ${current} at line ${tag.line} doesn't match ${before} at line ${last.line}`);
            }
        } else {
            tagsStack.push(tag);
        }
    }
    for (let tag of tagsStack) {
        throw new Error(`[MXC Error(checker-tmpl-unmatch)] unclosed tag ${recover(tag.match)} at line ${tag.line}`);
    }
};