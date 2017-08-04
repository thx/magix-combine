/*
    初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
 */
let path = require('path');
let configs = require('./util-config');
let md5 = require('./util-md5');
module.exports = () => {
    if (!configs.$inited) {
        configs.$inited = 1;
        configs.tmplFolder = path.resolve(configs.tmplFolder);
        configs.srcFolder = path.resolve(configs.srcFolder);
        configs.compileFileExtNamesReg = new RegExp('\\.(?:' + configs.compileFileExtNames.join('|') + ')$');
        configs.tmplFileExtNamesReg = new RegExp('\\.(?:' + configs.tmplFileExtNames.join('|') + ')$');
        configs.moduleIdRemovedPath = configs.tmplFolder; //把路径中开始到模板目录移除就基本上是模块路径了
        if (!configs.disableMagixUpdater) {
            configs.tmplCommand = /<%[\s\S]*?%>/g;
        }
        if (!configs.cssSelectorPrefix) {
            configs.cssSelectorPrefix = 'mx' + md5(configs.tmplFolder, 3, 'md5CssFileLen') + '-';
        }
    }
};