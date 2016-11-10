//增加loader
var configs = require('./util-config');
var tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[${requires}],function(${vars}){${content}\r\n});',
    amd1: 'define(\'${moduleId}\',[],function(){\r\n${content}\r\n});'
};
var moduleExportsReg = /\bmodule\.exports\s*=\s*/;
var amdDefineReg = /\bdefine\.amd\b/;
module.exports = function(e) {
    var key = configs.loaderType + (e.requires.length ? '' : '1');
    var tmpl = tmpls[key];
    for (var p in e) {
        var reg = new RegExp('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
    }
    if (configs.loaderType == 'amd' && !amdDefineReg.test(tmpl)) {
        tmpl = tmpl.replace(moduleExportsReg, 'return ');
    }
    return tmpl;
};