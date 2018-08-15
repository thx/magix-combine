//兼容旧的模板处理


let oldMxEventReg = /\bmx-\w+\s*=\s*(['"])(\w+)<(?:stop|prevent|halt)>(?:{([\s\S]*?)})?\1/g;
let mustache = /\{\{#\s*\w+|\{\{\{\w+/;
let etpl = /\$\{[^{}]+?\}/;
let bx = /\s+bx-(?:datakey|tmpl|path|config)\s*=\s*['"]/;
let vframe = /<vframe\s+/;
let oldMxEventReg1 = /\bmx-(?!view|vframe|keys|options|data|partial|init|html|is|as|type|name)[a-zA-Z]+\s*=\s*(['"])\w+(?:\{[\s\S]*?\})?\1/g;
let bxCfg = /\bbx-config\s*=\s*"[^"]+"/g;

let isOldTemplate = tmpl => {
    oldMxEventReg.lastIndex = 0;
    oldMxEventReg1.lastIndex = 0;
    return oldMxEventReg.test(tmpl) ||
        mustache.test(tmpl) ||
        etpl.test(tmpl) ||
        bx.test(tmpl) ||
        vframe.test(tmpl) ||
        oldMxEventReg1.test(tmpl);
};
let storeOldEvent = (tmpl, dataset) => {
    let index = 0;
    return tmpl.replace(oldMxEventReg, m => {
        let key = '\x1a' + (index++) + '\x1a';
        dataset[key] = m;
        return key;
    }).replace(bxCfg, m => {
        let key = '\x1a' + (index++) + '\x1a';
        dataset[key] = m;
        return key;
    }).replace(oldMxEventReg1, m => {
        let key = '\x1a' + (index++) + '\x1a';
        dataset[key] = m;
        return key;
    });
};
let recoverOldEvent = (tmpl, dataset) => {
    return tmpl.replace(/\x1a\d+\x1a/g, m => {
        return dataset[m] || '';
    });
};

module.exports = {
    isOldTemplate,
    storeOldEvent,
    recoverOldEvent
};