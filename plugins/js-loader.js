//增加loader
let configs = require('./util-config');
let exportsReg = /\bmodule\.exports\b\s*=\s*/g;
let tmpls = {
    cmd: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\ndefine(\'${moduleId}\',[${requires}],function(require,exports,module){\r\n/*${vars}*/\r\n${content}\r\n});',
    cmd1: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\ndefine(\'${moduleId}\',function(require,exports,module){\r\n${content}\r\n});',
    amd: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\ndefine(\'${moduleId}\',[\'require\',\'module\',\'exports\',${requires}],function(require,module,exports){\r\n${content}\r\n});',
    amd1: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\nn  author:x inglie.lkf@alibaba-inc.com;k ooboy_li@163.com\r\n */\r\ndefine(\'${moduleId}\',[\'module\',\'exports\'],function(module,exports){\r\n${content}\r\n});',
    kissy: '/*\r\n  generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\nKISSY.add(\'${moduleId}\',function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}]});',
    kissy1: '/*\r\n     generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\nKISSY.add(\'${moduleId}\',function(S){\r\n${content}\r\n});',
    webpack: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\n${content}',
    webpack1: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\n${content}',
    iife: '/*\r\n    generate by magix-combine: https://github.com/thx/magix-combine\r\n    author: xinglie.lkf@alibaba-inc.com; kooboy_li@163.com\r\n */\r\n(function(){\r\n${content}\r\n})();'
};
module.exports = (e) => {
    let key = configs.loaderType + (e.requires.length ? '' : '1');
    let tmpl = tmpls[key] || tmpls.iife;
    for (let p in e) {
        let reg = new RegExp('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, (e[p] + '').replace(/\$/g, '$$$$'));
    }
    if (configs.loaderType == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};