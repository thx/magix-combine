let util = require('./util');
let md5 = require('./util-md5');
let configs = require('./util-config');
let checker = require('./css-checker');
let slashReg = /[\/\.]/g;
let cssCommentReg = /\s*\/\*[\s\S]+?\*\/\s*/g;
let cssNameReg = /(?:@|global)?\.([\w\-]+)(\[[^\]]*?\])?(?=[^\{\}]*?\{)/g;
let cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style):([\w\-]+)\1\]/g;
let genCssNamesKey = (file, ignorePrefix) => {
    //获取模块的id
    let cssId = util.extractModuleId(file);
    if (configs.compressCss) {
        cssId = md5(cssId, configs.md5CssFileLen, 'md5CssFileLen');
    } else {
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
    }
    //css前缀是配置项中的前缀加上模块的md5信息
    if (!ignorePrefix) {
        cssId = (configs.cssSelectorPrefix || 'mx-') + cssId;
    }
    return cssId;
};
let genCssSelector = (selector) => {
    let mappedName = selector;
    if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (selector.length > configs.md5CssSelectorLen) {
            mappedName = md5(selector, configs.md5CssSelectorLen);
        }
    }
    return mappedName;
};
let addGlobal = (name, transformSelector, guid, lazyGlobal, file, namesMap, namesToFiles) => {
    if (configs.log && namesMap[name] && namesToFiles[name] && !namesToFiles[name][file]) {
        checker.markExists(name, file, Object.keys(namesToFiles[name]) + '');
    }
    namesMap[name] = transformSelector;
    if (!namesToFiles[name]) {
        namesToFiles[name] = {};
        namesToFiles[name + '!s'] = {};
    } else if (!lazyGlobal && namesToFiles[name + '!g'] != guid) {
        namesToFiles[name + '!s'] = {};
    }

    namesToFiles[name + '!g'] = guid;
    namesToFiles[name][file] = 1;
    if (!lazyGlobal) {
        namesToFiles[name + '!s'][transformSelector] = file;
    }
    if (lazyGlobal) {
        let list = namesToFiles[name + '!r'];
        if (list && list.length >= 0) {
            if (!list[file]) {
                list[file] = 1;
                list.push(file);
            }
        } else {
            namesToFiles[name + '!r'] = [file];
        }
        checker.markLazyDeclared(name);
    } else {
        namesToFiles[name + '!r'] = [file];
    }
};
//处理css类名
let cssNameProcessor = (m, name, attr, ctx) => {
    attr = attr || '';
    if (m.indexOf('global') === 0) {
        name = m.slice(7);
        addGlobal(name, name, 0, true, ctx.file, ctx.namesMap, ctx.namesToFiles);
        return m.slice(6);
    }
    if (m.charAt(0) == '@') {
        name = m.slice(2);
        addGlobal(name, name, 0, true, ctx.file, ctx.namesMap, ctx.namesToFiles);
        return m.slice(1);
    }
    let mappedName = genCssSelector(name);
    //只在原来的css类名前面加前缀
    let result = (ctx.cNamesMap[name] = ctx.namesKey + '-' + mappedName);
    if (ctx.addToGlobalCSS) { //是否增加到当前模块的全局css里，因为一个view.js可以依赖多个css文件
        addGlobal(name, result, 0, 0, ctx.file, ctx.namesMap, ctx.namesToFiles);
    }
    ctx.cNamesToFiles[name + '!r'] = [ctx.file];
    return '.' + result + attr;
};
module.exports = {
    cssCommentReg,
    cssNameReg,
    cssRefReg,
    genCssNamesKey,
    genCssSelector,
    addGlobal,
    cssNameProcessor
};