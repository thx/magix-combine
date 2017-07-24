/*
    增加loader
 */
let regexp = require('./util-rcache');
let exportsReg = /\bmodule\.exports\b\s*=\s*/g;
let header = '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: kooboy_li@163.com\r\n */\r\n';
let tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: 'define(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[\'require\',\'exports\',\'module\',${requires}],function(require,exports,module){\r\n${content}\r\n});',
    amd1: 'define(\'${moduleId}\',[\'exports\',\'module\'],function(exports,module){\r\n${content}\r\n});',
    kissy: 'KISSY.add(\'${moduleId}\',function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}]});',
    kissy1: 'KISSY.add(\'${moduleId}\',function(S){\r\n${content}\r\n});',
    webpack: '${content}',
    webpack1: '${content}',
    none: '${content}',
    none1: '${content}',
    iife: '(function(){\r\n${content}\r\n})();'
};
module.exports = e => {
    let loader = e.loader;
    let key = loader + (e.requires.length ? '' : '1');
    let tmpl = header + (tmpls[key] || tmpls.iife);
    for (let p in e) {
        let reg = regexp.get('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, regexp.encode(e[p]));
    }
    if (loader == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};