//https://github.com/marcosbasualdo/UnclosedHtmlTags/blob/master/index.js

let chalk = require('chalk');
let slog = require('./util-log');
let configs = require('./util-config');
let commentReg = /<!--[\s\S]*?-->/g;
let tagRemovedReg = /<(style|script)[^>]*>[\s\S]*?<\/\1>/g;
let tagReg = /<(\/)?([a-z0-9\-.:_]+)[^>]*>?/ig;
let brReg = /(?:\r\n|\r|\n)/;
let selfCloseTags = {
    area: 1,
    base: 1,
    basefont: 1,
    br: 1,
    col: 1,
    embed: 1,
    frame: 1,
    hr: 1,
    img: 1,
    input: 1,
    isindex: 1,
    keygen: 1,
    link: 1,
    meta: 1,
    param: 1,
    source: 1,
    track: 1,
    wbr: 1
};
let brPlaceholder = m => {
    let count = m.split(brReg).length;
    return new Array(count).join('\n');
};
let cleanHTML = tmpl => {
    tmpl = tmpl.replace(commentReg, brPlaceholder)
        .replace(tagRemovedReg, brPlaceholder);
    if (configs.tmplCommand) {
        tmpl = tmpl.replace(configs.tmplCommand, brPlaceholder);
    }
    return tmpl;
};

module.exports = (tmpl, e) => {
    tmpl = cleanHTML(tmpl);
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
                close = isClosed(line, offset);
                if (!close) {
                    slog.ever(chalk.red('tag ' + name + ' recommand closed at line: ' + lineCount), 'at file', chalk.magenta(e.shortHTMLFile));
                }
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
    for (let tag of tags) {
        if (tag.close) {
            if (!tagsStack.length) {
                throw new Error(`${tag.match} doesn't have corresponding open tag at line  ${tag.line}`);
            }
            let last = tagsStack.pop();
            if (tag.name != last.name) {
                throw new Error(`${tag.match} at line ${tag.line} doesn't match open tag ${last.match} at line ${last.line}`);
            }
        } else {
            tagsStack.push(tag);
        }
    }
    for (let tag of tagsStack) {
        throw new Error(`unclosed tag ${tag.match} at line ${tag.line}`);
    }
};