//增加loader
let configs = require('./util-config');
let exportsReg = /\bmodule\.exports\b\s*=\s*/g;
let header = '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\n';
let tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[\'require\',\'module\',\'exports\',${requires}],function(require,module,exports){\r\n${content}\r\n});',
    amd1: 'define(\'${moduleId}\',[\'module\',\'exports\'],function(module,exports){\r\n${content}\r\n});',
    kissy: 'KISSY.add(\'${moduleId}\',function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}]});',
    kissy1: 'KISSY.add(\'${moduleId}\',function(S){\r\n${content}\r\n});',
    webpack: '${content}',
    webpack1: '${content}',
    none: '${content}',
    none1: '${content}',
    iife: '(function(){\r\n${content}\r\n})();'
};
module.exports = (e) => {
    let key = configs.loaderType + (e.requires.length ? '' : '1');
    let tmpl = header + (tmpls[key] || tmpls.iife);
    for (let p in e) {
        let reg = new RegExp('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
    }
    if (configs.loaderType == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};