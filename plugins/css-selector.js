let utils = require('./util');
let md5 = require('./util-md5');
let configs = require('./util-config');
let checker = require('./checker');
let cssParser = require('./css-parser');
let slashReg = /[\/\.]/g;
let cssCommentReg = /\/\*[\s\S]+?\*\//g;
let cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.style):([\w\-]+)\1\]/g;
let genCssNamesKey = (file, ignorePrefix) => {
    //获取模块的id
    let cssId = utils.extractModuleId(file);
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
let genCssSelector = selector => {
    let mappedName = selector;
    if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (selector.length > configs.md5CssSelectorLen) {
            mappedName = md5(selector, configs.md5CssSelectorLen);
        }
    }
    return mappedName;
};
/**
 * 添加到全局样式
 * @param  {string} name 原始样式名
 * @param  {string} transformSelector 变化后的，即可能是压缩后的样式
 * @param  {number} guid 目前仅标记是否全局的标识
 * @param  {boolean} lazyGlobal 是否在文件中标记全局的
 * @param  {string} file 所在文件
 * @param  {object} namesMap 名称映射对象
 * @param  {object} namesToFiles 名称到文件映射对象
 */
let addGlobal = (name, transformSelector, guid, lazyGlobal, file, namesMap, namesToFiles) => {
    //记录重名的
    if (configs.log && namesMap[name] && namesToFiles[name] && !namesToFiles[name][file]) {
        checker.CSS.markExists('.' + name, file, Object.keys(namesToFiles[name]) + '');
    }
    namesMap[name] = transformSelector;
    if (!namesToFiles[name]) { //不存在
        namesToFiles[name] = Object.create(null);
        namesToFiles[name + '!s'] = Object.create(null);
    } else if (!lazyGlobal && namesToFiles[name + '!g'] != guid) { //是否全局
        namesToFiles[name + '!s'] = Object.create(null);
    }

    namesToFiles[name + '!g'] = guid;
    namesToFiles[name][file] = 1;
    if (!lazyGlobal) {
        namesToFiles[name + '!s'][transformSelector] = file;
    }
    if (lazyGlobal) { //在文件中才标识的
        let list = namesToFiles[name + '!r'];
        if (list && list.length >= 0) {
            if (!list[file]) {
                list[file] = 1;
                list.push(file);
            }
        } else {
            namesToFiles[name + '!r'] = [file];
        }
        checker.CSS.markLazyDeclared(name);
    } else {
        namesToFiles[name + '!r'] = [file];
    }
};

let ignoreTags = {
    html: 1,
    body: 1
};
let cssNameNewProcessor = (css, ctx) => {
    let pInfo = cssParser(css, ctx.shortFile);
    if (pInfo.nests.length) { //标记过于复杂的样式规则
        checker.CSS.markGlobal(ctx.file, '"' + pInfo.nests.join('","') + '"');
    }
    let tokens = pInfo.tokens;
    for (let i = tokens.length - 1; i >= 0; i--) {
        let token = tokens[i];
        let id = token.name;
        if (token.type == 'tag' || token.type == 'sattr') {
            if (token.type == 'sattr') {
                id = '[' + id + ']';
            }
            if (!ignoreTags[id]) { //标签或属性选择器
                ctx.fileTags[id] = id;
                if (!ctx.tagsToFiles[id]) {
                    ctx.tagsToFiles[id] = Object.create(null);
                }
                ctx.tagsToFiles[id][ctx.file] = id;
            }
        } else if (token.type == 'class') {
            let mappedName = genCssSelector(id);
            let result = (ctx.cNamesMap[id] = ctx.namesKey + '-' + mappedName);
            if (ctx.addToGlobalCSS) {
                addGlobal(id, result, 0, 0, ctx.file, ctx.namesMap, ctx.namesToFiles);
            }
            ctx.cNamesToFiles[id + '!r'] = [ctx.file];
            css = css.slice(0, token.start) + result + css.slice(token.end);
        }
    }
    return css;
};
let cssNameGlobalProcessor = (css, ctx) => {
    let pInfo = cssParser(css, ctx.shortFile);
    if (pInfo.nests.length) {
        checker.CSS.markGlobal(ctx.file, '"' + pInfo.nests.join('","') + '"');
    }
    let tokens = pInfo.tokens;
    for (let i = tokens.length - 1; i >= 0; i--) {
        let token = tokens[i];
        let id = token.name;
        if (token.type == 'tag' || token.type == 'sattr') {
            if (token.type == 'sattr') {
                id = '[' + id + ']';
            }
            if (!ignoreTags[id]) {
                ctx.fileTags[id] = id;
                if (!ctx.tagsToFiles[id]) {
                    ctx.tagsToFiles[id] = Object.create(null);
                }
                ctx.tagsToFiles[id][ctx.file] = id;
            }
        } else if (token.type == 'class') {
            ctx.cNamesMap[id] = id;
            addGlobal(id, id, ctx.globalGuid, ctx.lazyGlobal, ctx.file, ctx.namesMap, ctx.namesToFiles);
            if (ctx.cNamesToFiles) {
                ctx.cNamesToFiles[id + '!r'] = ctx.namesToFiles[id + '!r'];
            }
        }
    }
};
module.exports = {
    cssCommentReg,
    cssRefReg,
    genCssNamesKey,
    genCssSelector,
    addGlobal,
    cssNameNewProcessor,
    cssNameGlobalProcessor
};