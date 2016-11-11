//增加loader
var configs = require('./util-config');
var tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[\'require\',\'module\',\'exports\',${requires}],function(require,module,exports){${content}\r\n});',
    amd1: 'define(\'${moduleId}\',[\'module\',\'exports\'],function(module,exports){\r\n${content}\r\n});',
    iife: '(function(){\r\n${content}\r\n})();'
};
module.exports = function(e) {
    var key = configs.loaderType + (e.requires.length ? '' : '1');
    var tmpl = tmpls[key] || tmpls.iife;
    for (var p in e) {
        var reg = new RegExp('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
    }
    return tmpl;
};