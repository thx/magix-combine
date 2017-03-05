var util = require('./util');
var atpath = require('./util-atpath');
var jsRequireParser = require('./js-require-parser');
//分析js中的require命令
var depsReg = /(?:(var\s+|,)\s*([^=\s]+)\s*=\s*)?\brequire\s*\(([^\(\)]+)\)(;)?/g;
//var exportsReg = /module\.exports\s*=\s*/;
var anchor = '\u0011';
var anchorReg = /(['"])\u0011([^'"]+)\1/;
var configs = require('./util-config');
module.exports = {
    process: function(e) {
        var deps = [];
        var vars = [];
        var noKeyDeps = [];
        var moduleId = util.extractModuleId(e.from);
        var depsInfo = jsRequireParser.process(e.content);
        for (var i = 0, start; i < depsInfo.length; i++) {
            start = depsInfo[i].start + i;
            e.content = e.content.substring(0, start) + anchor + e.content.substring(start);
        }
        e.content = e.content.replace(depsReg, function(match, prefix, key, str, tail) {
            var info = str.match(anchorReg);
            if (!info) return match;
            str = info[1] + info[2] + info[1];
            if (configs.useAtPathConverter) {
                str = atpath.resolvePath(str, moduleId);
            }
            var depId;
            var reqInfo = {
                prefix: prefix,
                tail: tail || '',
                dependedId: depId = str.slice(1, -1),
                variable: key
            };
            configs.resolveRequire(reqInfo);
            var dId;
            if (key != reqInfo.variable || depId != reqInfo.dependedId) {
                if (reqInfo.dependedId) {
                    dId = JSON.stringify(reqInfo.dependedId);
                    deps.push(dId);
                    if (reqInfo.variable) {
                        vars.push(reqInfo.variable);
                    }
                }
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
        //console.log(e.content);
        deps = deps.concat(noKeyDeps);
        e.moduleId = moduleId;
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        return Promise.resolve(e);
    }
};