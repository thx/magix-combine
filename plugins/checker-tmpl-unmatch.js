//https://github.com/marcosbasualdo/UnclosedHtmlTags/blob/master/index.js

let configs = require('./util-config');
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
let commentReg = /<!--[\s\S]*?-->/g;
let tagRemovedReg = /<(style|script|svg)[^>]*>[\s\S]*?<\/\1>/g;
let tagReg = /<(\/)?([a-z0-9\-]+)[^>]*>?/img;
let brReg = /(?:\r\n|\r|\n)/;
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
module.exports = tmpl => {
    tmpl = cleanHTML(tmpl);
    //console.log(tmpl);
    let tags = [];
    let lines = tmpl.split(brReg);
    let lineCount = 1;
    for (let line of lines) {
        line.replace(tagReg, (m, close, name) => {
            //console.log(m,close,name);
            //自闭合不检测
            if (selfCloseTags.hasOwnProperty(name)) return;
            //自定义的mx-tag不检测
            if (name.indexOf('mx-') === 0) return;
            //用户指定的不检测的标签
            if (configs.tmplUncheckTags.hasOwnProperty(name)) return;
            tags.push({
                line: lineCount,
                close: !!close,
                match: m,
                name: name
            });
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