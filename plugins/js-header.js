//处理文件的头信息
let configs = require('./util-config');
let snippetReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#(?:snippet|gallery-config|gconfig|g-config|raw|gcfg)(?:[^\r\n]+)?\1\s*;?/g;
let excludeReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#exclude[\(\[]([\w,]+)[\)\]]\1\s*;?/g;
let excludeReg1 = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#exclude\s*=\s*([\w,_]+)\1\s*;?/g;
let loaderReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#loader\s*=\s*([\w]+)\1\s*;?/g;
let checkerReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#((?:un)?check)\[([\w,]+)\]\1\s*;?/g;

let checkerReg1 = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#((?:un)?check)\s*=\s*([\w,]+)\1\s*;?/g;
let exRequiresReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#(?:(?:no|non|ex)requires)\s*=\s*([^\r\n;]+)\1\s*;?/g;
//let jsThisAliasReg = /(?:^|[\r\n])\s*(?:\/{2,})?\s*(['"])?#this\s*=\s*([\w_])\1\s*;?/g;
module.exports = (content) => {
    let execBeforeProcessor = true,
        execAfterProcessor = true,
        ignoreAllProcessor = false;
    let addWrapper = true;
    let excludeProcessor = (m, q, keys) => {
        keys = keys.split(',');
        if (keys.indexOf('define') > -1 || keys.indexOf('loader') > -1) {
            addWrapper = false;
        }
        if (keys.indexOf('before') > -1 || keys.indexOf('beforeProcessor') > -1) {
            execBeforeProcessor = false;
        }
        if (keys.indexOf('after') > -1 || keys.indexOf('afterProcessor') > -1) {
            execAfterProcessor = false;
        }
        if (keys.indexOf('allProcessor') > -1) {
            ignoreAllProcessor = true;
        }
        return '\r\n';
    };
    if (ignoreAllProcessor) {
        execBeforeProcessor = execAfterProcessor = false;
    }
    content = content
        .replace(excludeReg, excludeProcessor)
        .replace(excludeReg1, excludeProcessor);
    let checkerCfg = Object.assign({}, configs.checker);
    let checkerProcessor = (m, q, key, value) => {
        let values = value.split(',');
        for (let v of values) {
            v = v.trim();
            if (key == 'check') {
                checkerCfg[v] = true;
            } else {
                checkerCfg[v] = false;
            }
        }
        return '\r\n';
    };
    content = content
        .replace(checkerReg, checkerProcessor)
        .replace(checkerReg1, checkerProcessor);
    //let thisAlias = configs.thisAlias;
    /*content = content.replace(jsThisAliasReg, (m, q, value) => {
        thisAlias = value;
        return '\r\n';
    });*/
    snippetReg.lastIndex = 0;
    let isSnippet = snippetReg.test(content);
    content = content.replace(snippetReg, '');
    let loader;
    content = content.replace(loaderReg, (m, q, type) => {
        loader = type;
        return '\r\n';
    });
    let exRequires = [];
    content = content.replace(exRequiresReg, (m, q, reqs) => {
        exRequires = reqs.split(',').map(i => {
            i = i.trim();
            if (i.startsWith('\'') && i.endsWith('\'')) {
                i = i.slice(1, -1);
            }
            if (!i.startsWith('"') && !i.endsWith('"')) {
                i = `"${i}"`;
            }
            return i;
        });
        return '\r\n';
    });
    return {
        content,
        isSnippet,
        addWrapper,
        checkerCfg,
        loader,
        exRequires,
        //thisAlias,
        ignoreAllProcessor,
        execBeforeProcessor,
        execAfterProcessor
    };
};