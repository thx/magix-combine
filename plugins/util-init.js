/*
    初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
 */
let path = require('path');
let configs = require('./util-config');
let crypto = require('crypto');
module.exports = () => {
    if (!configs.$inited) {
        configs.$inited = 1;
        if (configs.tmplFolder) {
            configs.commonFolder = configs.tmplFolder;
        }
        if (configs.srcFolder) {
            configs.compiledFolder = configs.srcFolder;
        }
        configs.commonFolder = path.resolve(configs.commonFolder);
        configs.compiledFolder = path.resolve(configs.compiledFolder);
        configs.jsFileExtNamesReg = new RegExp('\\.(?:' + configs.jsFileExtNames.join('|') + ')$');
        configs.moduleIdRemovedPath = configs.commonFolder; //把路径中开始到模板目录移除就基本上是模块路径了
        if (configs.projectName === null) {
            let str = crypto.createHash('sha512')
                .update(configs.commonFolder, 'ascii')
                .digest('hex');
            configs.projectName = 'x' + str.substring(0, 2);
        }

        let tmplExtNames = configs.tmplFileExtNames;

        let names = tmplExtNames.slice();
        if (names.indexOf('mx') == -1) {
            names.push('mx');
        }
        configs.tmplFileExtNamesReg = new RegExp('\\.(?:' + names.join('|') + ')$');

        configs.htmlFileReg = new RegExp('([\'"])(raw|updater)?@[^\'"\\s@]+\\.(?:' + tmplExtNames.join('|') + ')((?::const\\[[^\\[\\]]*\\]|:global\\[[^\\[\\]]*\\]|:updateby\\[[^\\[\\]]*\\]|:art(?:\s*=\s*(?:true|false))?)+)?\\1');
        configs.htmlFileGlobalReg = new RegExp(configs.htmlFileReg, 'g');

        //模板处理，即处理view.html文件
        configs.fileTmplReg = new RegExp('([\'"])(raw|updater)?\\u0012@([^\'"\\s@]+)\\.(' + tmplExtNames.join('|') + ')((?::const\\[[^\\[\\]]*\\]|:global\\[[^\\[\\]]*\\]|:updateby\\[[^\\[\\]]*\\]|:art(?:\s*=\s*(?:true|false))?)+)?\\1', 'g');

        configs.tmplMxEventReg = /\bmx-(?!view|vframe|owner|autonomy|datafrom|guid|ssid|dep|html|static)([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

        if (configs.addTmplViewsToDependencies) {
            configs.tmplAddViewsToDependencies = true;
        } else if (configs.addTmplViewsToDependencies === false) {
            configs.tmplAddViewsToDependencies = false;
        }

        if (configs.outputTmplWithEvents) {
            configs.tmplOutputWithEvents = true;
        } else if (configs.outputTmplWithEvents === false) {
            configs.tmplOutputWithEvents = false;
        }

        if (configs.compressTmplVariable) {
            configs.tmplCompressVariable = true;
        } else if (configs.compressTmplVariable === false) {
            configs.tmplCompressVariable = false;
        }

        if (configs.magixUpdaterIncrement) {
            configs.tmplCompressVariable = false;
        }

        if (configs.sassOptions) {
            configs.sass = configs.sassOptions;
        }
        if (configs.lessOptions) {
            configs.less = configs.lessOptions;
        }
        if (configs.cssnanoOptions) {
            configs.cssnano = configs.cssnanoOptions;
        }

        if (configs.htmlminifierOptions) {
            configs.htmlminifier = configs.htmlminifierOptions;
        }

        let rsPrefix = configs.revisableStringPrefix;
        if (!rsPrefix) {
            rsPrefix = '__';
        } else if (rsPrefix.charAt(0) === '$') {//以$开头是开发者手动处理的
            rsPrefix = '_' + rsPrefix;
        }
        configs.revisableStringPrefix = rsPrefix;

        let galleryPrefixes = Object.create(null);
        galleryPrefixes.native = 1;
        for (let p in configs.galleries) {
            if (p.endsWith('Root')) {
                galleryPrefixes[p.slice(0, -4)] = 1;
            } else if (p.endsWith('Map')) {
                galleryPrefixes[p.slice(0, -3)] = 1;
            }
        }
        configs.galleryPrefixes = galleryPrefixes;
    }
};