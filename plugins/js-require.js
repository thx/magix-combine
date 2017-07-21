/*
    js中依赖处理
    允许通过resolveRequire进行依赖重写
 */
let utils = require('./util');
let jsRequireParser = require('./js-require-parser');
let path = require('path');
//分析js中的require命令
//let a=require('aa');
//var b;
//b=require('cc');
let depsReg = /(?:((?:var|let|const)\s+|,|\s|^)\s*([^=\s]+)\s*=\s*)?\brequire\s*\(\s*(['"])([^\(\)]+)\3\s*\)(;)?/g;
//let exportsReg = /module\.exports\s*=\s*/;
let configs = require('./util-config');
let cssShareReg = /^css@/;
module.exports = {
    process(e) {
        let deps = [];
        let vars = [];
        let noKeyDeps = [];
        let moduleId = utils.extractModuleId(e.from);
        if (!e.exclude) {
            let depsInfo = jsRequireParser.process(e.content);
            /*
                reqPos=[21,40,35,68]
             */
            let reqPos = [];
            for (let i = 0, start; i < depsInfo.length; i++) {
                start = depsInfo[i].start + i;
                reqPos.push(start);
            }
            reqPos = reqPos.reverse();
            e.content = e.content.replace(depsReg, (match, prefix, key, q, depId, tail, offset) => {
                let last = reqPos[reqPos.length - 1];
                // var require=require('cc'); => offset=0  offset+match.length==26
                // reqPos[0] in range [0,26] ?
                if (reqPos.length && offset < last && last < (offset + match.length)) {
                    reqPos.pop();
                    let reqInfo = {
                        prefix: prefix,
                        tail: tail || '',
                        dependedId: depId,
                        variable: key
                    };
                    if (cssShareReg.test(reqInfo.dependedId)) {
                        let extname = path.extname(reqInfo.dependedId);
                        reqInfo.dependedId = reqInfo.dependedId.replace(cssShareReg, '').replace(extname, '');
                        reqInfo.replacement = 'require("' + reqInfo.dependedId + '");\r\n"ref@' + reqInfo.dependedId + extname + '";';
                    }
                    configs.resolveRequire(reqInfo, e);
                    let dId;
                    if (reqInfo.dependedId) {
                        dId = JSON.stringify(reqInfo.dependedId);
                        deps.push(dId);
                        if (reqInfo.variable) {
                            vars.push(reqInfo.variable);
                        }
                    }
                    if (key != reqInfo.variable || depId != reqInfo.dependedId) {
                        if (!reqInfo.hasOwnProperty('replacement')) {
                            if (reqInfo.variable) {
                                prefix = prefix + reqInfo.variable + '=';
                            } else {
                                prefix = prefix || '';
                            }
                            if (reqInfo.replaceRequire) {
                                prefix += reqInfo.replaceRequire;
                            } else {
                                prefix += 'require(' + dId + ')';
                            }
                            reqInfo.replacement = prefix + reqInfo.tail;
                        }
                    } else {
                        if (!reqInfo.hasOwnProperty('replacement')) {
                            reqInfo.replacement = match;
                        }
                    }
                    if (configs.loaderType == 'kissy') {
                        reqInfo.replacement = '';
                    }
                    return reqInfo.replacement;
                }
                return match;
            });
            deps = deps.concat(noKeyDeps);
        }
        e.moduleId = moduleId;
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        return Promise.resolve(e);
    }
};