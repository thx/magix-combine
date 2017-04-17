//抽取模块id,如文件物理路径为'/users/xiglie/afp/tmpl/app/views/default.js'
//则抽取出来的模块id是 app/vies/default

let path = require('path');

let configs = require('./util-config');

let sep = path.sep;
let sepRegTmpl = sep.replace(/\\/g, '\\\\');
let sepReg = new RegExp(sepRegTmpl, 'g');
let cssTailReg = /\.(?:css|less|scss)/i;
let startSlashReg = /^\//;
let extractModuleId = (file) => {
    let id = file.replace(configs.moduleIdRemovedPath, '')
        .replace(configs.compileFileExtNamesReg, '')
        .replace(cssTailReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
    id = configs.resolveModuleId(id);
    return id;
};

module.exports = {
    extractModuleId: extractModuleId
};