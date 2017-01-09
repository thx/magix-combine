var util = require('./util');
var atpath = require('./util-atpath');
var jsRequireParser = require('./js-require-parser');
//分析js中的require命令
var depsReg = /(?:var\s+([^=]+)=\s*)?\brequire\s*\(([^\(\)]+)\);?/g;
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
        e.content = e.content.replace(depsReg, function(match, key, str) {
            var info = str.match(anchorReg);
            if (!info) return match;
            str = info[1] + info[2] + info[1];
            str = atpath.resolvePath(str, moduleId);
            if (key) {
                vars.push(key);
                deps.push(str);
            } else {
                noKeyDeps.push(str);
            }
            if (configs.loaderType == 'kissy') {
                return '';
            }
            return match.replace(anchor, '');
        });
        deps = deps.concat(noKeyDeps);
        e.moduleId = moduleId;
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        //e.hasxports = hasExports;
        return Promise.resolve(e);
    }
};