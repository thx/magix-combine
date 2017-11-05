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
        if (e.addWrapper) {
            let depsInfo = jsRequireParser.process(e.content);
            depsInfo = depsInfo.reverse();
            e.content = e.content.replace(depsReg, (match, prefix, key, q, depId, tail, offset) => {
                if (depsInfo.length) {
                    let last = depsInfo[depsInfo.length - 1].start;
                    // var require=require('cc'); => offset=0  offset+match.length==26
                    // depsInfo[0] in range [0,26] ?
                    if (offset < last && last < (offset + match.length)) {
                        depsInfo.pop();
                        let reqInfo = {
                            prefix: prefix,
                            tail: tail || '',
                            dependedId: depId,
                            variable: key
                        };
                        if (cssShareReg.test(reqInfo.dependedId)) {
                            let extname = path.extname(reqInfo.dependedId);
                            reqInfo.dependedId = reqInfo.dependedId.replace(cssShareReg, '').replace(extname, '');
                            reqInfo.replacement = (e.loader == 'kissy' ? '' : 'require("' + reqInfo.dependedId + '");\r\n') + '"ref@' + reqInfo.dependedId + extname + '";';
                        }
                        configs.resolveRequire(reqInfo, e);
                        let dId;
                        if (reqInfo.dependedId) {
                            dId = JSON.stringify(reqInfo.dependedId);
                            if (reqInfo.variable) {
                                deps.push(dId);
                                vars.push(reqInfo.variable);
                            } else {
                                noKeyDeps.push(dId);
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
                                reqInfo.replacement = e.loader == 'kissy' ? '' : (prefix + reqInfo.tail);
                            }
                        } else {
                            if (!reqInfo.hasOwnProperty('replacement')) {
                                reqInfo.replacement = e.loader == 'kissy' ? '' : match;
                            }
                        }
                        return reqInfo.replacement;
                    }
                }
                return match;
            });
            deps = deps.concat(noKeyDeps);
        }
        e.moduleId = moduleId;
        e.pkgName = moduleId.slice(0, moduleId.indexOf('/'));
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        return Promise.resolve(e);
    }
};