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
        configs.jsFileExtNamesReg = new RegExp('\\.(?:' + configs.jsFileExtNames.join('|') + ')$');
        configs.moduleIdRemovedPath = configs.tmplFolder; //把路径中开始到模板目录移除就基本上是模块路径了
        if (!configs.disableMagixUpdater && !configs.tmplCommand) {
            configs.tmplCommand = /<%[\s\S]*?%>/g;
        }
        if (!configs.tmplCommand) {
            configs.tmplCommand = /<%[\s\S]*?%>/g;
        }
        if (!configs.cssSelectorPrefix) {
            configs.cssSelectorPrefix = 'x' + md5(configs.tmplFolder, 3, 'md5CssFileLen');
        }

        let tmplExtNames = configs.tmplFileExtNames;

        let names = tmplExtNames.slice();
        if (names.indexOf('mx') == -1) {
            names.push('mx');
        }
        configs.tmplFileExtNamesReg = new RegExp('\\.(?:' + names.join('|') + ')$');

        configs.htmlFileReg = new RegExp('([\'"])(?:raw|magix|updater)?@[^\'"]+\\.(?:' + tmplExtNames.join('|') + ')((?::const\\[[^\\[\\]]+\\]|:global\\[[^\\[\\]]+\\]|:updateby\\[[^\\[\\]]+\\])+)?\\1');

        //模板处理，即处理view.html文件
        configs.fileTmplReg = new RegExp('(\\btmpl\\s*:\\s*)?([\'"])(raw|magix|updater)?\\u0012@([^\'"]+)\\.(' + tmplExtNames.join('|') + ')((?::const\\[[^\\[\\]]+\\]|:global\\[[^\\[\\]]+\\]|:updateby\\[[^\\[\\]]+\\])+)?\\2', 'g');
    }
};