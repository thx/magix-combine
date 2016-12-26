//抽取模块id,如文件物理路径为'/users/xiglie/afp/tmpl/app/views/default.js'
//则抽取出来的模块id是 app/vies/default

var path = require('path');

var configs = require('./util-config');

var sep = path.sep;
var sepRegTmpl = sep.replace(/\\/g, '\\\\');
var sepReg = new RegExp(sepRegTmpl, 'g');
var jsOrMxTailReg = /\.(?:js|mx)$/i;
var cssTailReg = /\.(?:css|less|scss)/i;
var startSlashReg = /^\//;
var extractModuleId = function(file) {
    return file.replace(configs.moduleIdRemovedPath, '')
        .replace(jsOrMxTailReg, '')
        .replace(cssTailReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
};

module.exports = {
    extractModuleId: extractModuleId
};