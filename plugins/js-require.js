let util = require('./util');
let atpath = require('./util-atpath');
let jsRequireParser = require('./js-require-parser');
let path = require('path');
//分析js中的require命令
let depsReg = /(?:((?:var|let|const)\s+|,)\s*([^=\s]+)\s*=\s*)?\brequire\s*\(([^\(\)]+)\)(;)?/g;
//let exportsReg = /module\.exports\s*=\s*/;
let anchor = '\u0011';
let anchorReg = /(['"])\u0011([^'"]+)\1/;
let configs = require('./util-config');
let cssShareReg = /^css@/;
module.exports = {
    process(e) {
        let deps = [];
        let vars = [];
        let noKeyDeps = [];
        let moduleId = util.extractModuleId(e.from);
        if (!e.exclude) {
            let depsInfo = jsRequireParser.process(e.content);
            for (let i = 0, start; i < depsInfo.length; i++) {
                start = depsInfo[i].start + i;
                e.content = e.content.substring(0, start) + anchor + e.content.substring(start);
            }
            e.content = e.content.replace(depsReg, (match, prefix, key, str, tail) => {
                let info = str.match(anchorReg);
                if (!info) return match;
                str = info[1] + info[2] + info[1];
                let originalId = str;
                if (configs.useAtPathConverter) {
                    str = atpath.resolvePath(str, moduleId);
                }
                let depId = str.slice(1, -1);
                let reqInfo = {
                    prefix: prefix,
                    tail: tail || '',
                    originalDependedId: originalId.slice(1, -1),
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
                        reqInfo.replacement = match.replace(anchor, '');
                    }
                }
                return reqInfo.replacement;
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