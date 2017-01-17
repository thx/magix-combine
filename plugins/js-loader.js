//增加loader
var configs = require('./util-config');
var exportsReg = /\bmodule\.exports\b\s*=\s*/g;
var tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[\'require\',\'module\',\'exports\',${requires}],function(require,module,exports){${content}\r\n});',
    amd1: 'define(\'${moduleId}\',[\'module\',\'exports\'],function(module,exports){\r\n${content}\r\n});',
    kissy: 'KISSY.add(\'${moduleId}\',function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}]});',
    kissy1: 'KISSY.add(\'${moduleId}\',function(S){\r\n${content}\r\n});',
    webpack: '${content}',
    webpack1: '${content}',
    iife: '(function(){\r\n${content}\r\n})();'
};
module.exports = function(e) {
    var key = configs.loaderType + (e.requires.length ? '' : '1');
    var tmpl = tmpls[key] || tmpls.iife;
    for (var p in e) {
        var reg = new RegExp('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
    }
    if (configs.loaderType == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};