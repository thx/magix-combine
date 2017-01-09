//初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
var path = require('path');
var configs = require('./util-config');
var sep = path.sep;
var sepRegTmpl = sep.replace(/\\/g, '\\\\');
module.exports = function() {
    if (!configs.initedFolder) {
        configs.initedFolder = 1;
        configs.tmplFolder = path.resolve(configs.tmplFolder);
        configs.srcFolder = path.resolve(configs.srcFolder);
        //configs.buildFolder = path.resolve(configs.buildFolder);

        var tmplFolderName = path.basename(configs.tmplFolder);
        var srcFolderName = path.basename(configs.srcFolder);
        //var buildFolderName = path.basename(configs.buildFolder);
        configs.moduleIdRemovedPath = path.resolve(configs.tmplFolder); //把路径中开始到模板目录移除就基本上是模块路径了
        configs.tmplReg = new RegExp('(' + sepRegTmpl + '?)' + tmplFolderName + sepRegTmpl);
        configs.srcHolder = '$1' + srcFolderName + sep;
        configs.srcReg = new RegExp('(' + sepRegTmpl + '?)' + srcFolderName + sepRegTmpl);
        //configs.buildHolder = '$1' + buildFolderName + sep;
        if (configs.useMagixTmplAndUpdater) {
            configs.tmplCommand = /<%[\s\S]+?%>/g;
            configs.compressTmplCommand = function(tmpl) {
                var stores = {},
                    idx = 1,
                    key = '&\u001e';
                //下面这行是把压缩模板命令，删除可能存在的空格
                tmpl = tmpl.replace(/<%([=!@:])?([\s\S]*?)%>/g, function(m, oper, content) {
                    return '<%' + (oper || '') + content.trim().replace(/\s*([,\(\)\{\}])\s*/g, '$1') + '%>';
                });
                //存储非输出命令(控制命令)
                tmpl = tmpl.replace(/<%[^=!@:][\s\S]*?%>\s*/g, function(m, k) {
                    k = key + (idx++) + key; //占位符
                    stores[k] = m; //存储
                    return k;
                });
                //把多个连续存控制命令做压缩
                tmpl = tmpl.replace(/(?:&\u001e\d+&\u001e){2,}/g, function(m) {
                    m = m.replace(/&\u001e\d+&\u001e/g, function(n) {
                        return stores[n];
                    }); //命令还原
                    return m.replace(/%>\s*<%/g, ';').replace(/([\{\}]);/g, '$1').replace(/;+/g, ';'); //删除中间的%><%及分号
                });
                //console.log(tmpl);
                tmpl = tmpl.replace(/&\u001e\d+&\u001e/g, function(n) { //其它命令还原
                    //console.log(n,stores[n]);
                    return stores[n];
                });
                //console.log(tmpl);
                return tmpl;
            };

        }
    }
};