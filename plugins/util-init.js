//初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
let path = require('path');
let configs = require('./util-config');
module.exports = () => {
    if (!configs.initedFolder) {
        configs.initedFolder = 1;
        configs.tmplFolder = path.resolve(configs.tmplFolder);
        configs.srcFolder = path.resolve(configs.srcFolder);
        configs.compileFileExtNamesReg = new RegExp('\\.(?:' + configs.compileFileExtNames.join('|') + ')$');
        configs.tmplFileExtNamesReg = new RegExp('\\.(?:' + configs.tmplFileExtNames.join('|') + ')$');
        configs.moduleIdRemovedPath = configs.tmplFolder; //把路径中开始到模板目录移除就基本上是模块路径了
        if (!configs.disableMagixUpdater) {
            configs.tmplCommand = /<%[\s\S]+?%>/g;
            let outputCmdReg = /<%([=!@:~])?([\s\S]*?)%>/g;
            let trimCmdReg = /\s*([,\(\)\{\}])\s*/g;
            let ctrlCmdReg = /<%[^=!@:~][\s\S]*?%>\s*/g;
            var phCmdReg = /&\u0008\d+&\u0008/g;
            let continuedCmdReg = /(?:&\u0008\d+&\u0008){2,}/g;
            let bwCmdReg = /%>\s*<%/g;
            let blockCmdReg = /([\{\}]);/g;
            let continuedSemicolonReg = /;+/g;
            let phKey = '&\u0008';
            configs.compressTmplCommand = (tmpl) => {
                let stores = {},
                    idx = 1;
                //下面这行是压缩模板命令，删除可能存在的空格
                tmpl = tmpl.replace(outputCmdReg, (m, oper, content) => {
                    return '<%' + (oper || '') + content.trim().replace(trimCmdReg, '$1') + '%>';
                });
                //存储非输出命令(控制命令)
                tmpl = tmpl.replace(ctrlCmdReg, (m, k) => {
                    k = phKey + (idx++) + phKey; //占位符
                    stores[k] = m; //存储
                    return k;
                });
                //把多个连续的控制命令做压缩
                tmpl = tmpl.replace(continuedCmdReg, (m) => {
                    return m.replace(phCmdReg, (n) => stores[n]) //命令还原
                        .replace(bwCmdReg, ';')
                        .replace(blockCmdReg, '$1')
                        .replace(continuedSemicolonReg, ';'); //删除中间的%><%及分号
                });
                tmpl = tmpl.replace(phCmdReg, (n) => stores[n]); //其它命令还原
                return tmpl;
            };
        }
    }
};