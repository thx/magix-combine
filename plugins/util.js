/*
    抽取模块id,如文件物理路径为'/users/xiglie/afp/tmpl/app/views/default.js'
    则抽取出来的模块id是 app/vies/default
 */

let path = require('path');
let sutil = require('util');
let configs = require('./util-config');

let sep = path.sep;
let sepRegTmpl = sep.replace(/\\/g, '\\\\');
let sepReg = new RegExp(sepRegTmpl, 'g');
let cssTailReg = /\.(?:css|less|scss)/i;
let startSlashReg = /^\//;
let extractModuleId = file => {
    let id = file.replace(configs.moduleIdRemovedPath, '')
        .replace(configs.jsFileExtNamesReg, '')
        .replace(cssTailReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
    id = configs.resolveModuleId(id);
    return id;
};

let clone = object => {
    if (sutil.isArray(object)) {
        let ta = [];
        for (let i = 0; i < object.length; i++) {
            ta[i] = clone(object[i]);
        }
        return ta;
    } else if (sutil.isObject(object)) {
        let temp = Object.create(null);
        for (let p in object) {
            temp[p] = clone(object[p]);
        }
        return temp;
    }
    return object;
};
let cloneAssign = (dest, src) => {
    Object.assign(dest, clone(src));
};
let uId = (fix, str, withoutSuffix) => {
    let id;
    do {
        id = Math.random().toString(36).replace(/[\d\.]/g, '');
    } while (~str.indexOf(id));
    return (fix || '') + id + (withoutSuffix ? '' : (fix || ''));
};
module.exports = {
    clone,
    uId,
    cloneAssign,
    extractModuleId
};