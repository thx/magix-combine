/*
    增加loader
    https://www.ecma-international.org/ecma-262/#sec-html-like-comments
 */
let regexp = require('./util-rcache');
let utils = require('./util');
let anchorKey = utils.uId('\x1e%\x1e$\x1e', '');
let package = require('../package.json');
let exportsReg = /\bmodule\.exports\b\s*=\s*/g;
let header = '/*\r\n    generate by magix-combine@' + package.version + ': https://github.com/thx/magix-combine\r\n    author: kooboy_li@163.com\r\n    loader: ${loader}\r\n */\r\n';
let tmpls = {
    cmd: 'define(\'${moduleId}\',[${requires}<!--' + anchorKey + '_requires-->\r\n],function(require,exports,module){\r\n/*${vars}*/\r\n<!--' + anchorKey + '_vars-->\r\n${content}\r\n});',
    amd: 'define(\'${moduleId}\',[\'require\',\'exports\',\'module\',${requires}<!--' + anchorKey + '_requires-->\r\n],function(require,exports,module){\r\n<!--' + anchorKey + '_vars-->\r\n${content}\r\n});',
    kissy: 'KISSY.add(\'${moduleId}\',function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}<!--' + anchorKey + '_requires-->\r\n]});',
    webpack: '<!--' + anchorKey + '_vars-->\r\n${content}',
    none: '${content}',
    iife: '(function(){\r\n${content}\r\n})();'
};
module.exports = e => {
    e.requiresAnchorKey = '<!--' + anchorKey + '_requires-->\r\n';
    e.varsAnchorKey = '<!--' + anchorKey + '_vars-->';
    e.addedWrapper = true;
    let loader = e.loader;
    let tmpl = header + (tmpls[loader] || tmpls.iife);
    for (let p in e) {
        let reg = regexp.get('\\$\\{' + p + '\\}', 'g');
        tmpl = tmpl.replace(reg, regexp.encode(e[p]));
    }
    if (loader == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};