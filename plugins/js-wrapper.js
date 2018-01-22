/*
    增加loader
    https://www.ecma-international.org/ecma-262/#sec-html-like-comments
 */
let regexp = require('./util-rcache');
let utils = require('./util');
let anchorKey = utils.uId('\x1e', '');
let package = require('../package.json');
let exportsReg = /\bmodule\.exports\b\s*=\s*/g;
let header = '/*\r\n    generate by magix-combine@' + package.version + ': https://github.com/thx/magix-combine\r\n    author: kooboy_li@163.com\r\n    loader: ${loader}\r\n */\r\n';
let reqsAnchorKey = '/* ' + anchorKey + '_requires */\r\n';
let varsAnchorKey = '/* ' + anchorKey + '_vars */';
let tmpls = {
    cmd: 'define("${moduleId}",[${requires}' + reqsAnchorKey + '],function(require,exports,module){\r\n/*${vars}*/\r\n' + varsAnchorKey + '\r\n${content}\r\n});',
    cmd_es: 'define("${moduleId}",[${requires}' + reqsAnchorKey + '],(require,exports,module)=>{\r\n/*${vars}*/\r\n' + varsAnchorKey + '\r\n${content}\r\n});',
    amd: 'define("${moduleId}",["require","exports","module",${requires}' + reqsAnchorKey + '],function(require,exports,module){\r\n' + varsAnchorKey + '\r\n${content}\r\n});',
    amd_es: 'define("${moduleId}",["require","exports","module",${requires}' + reqsAnchorKey + '],(require,exports,module)=>{\r\n' + varsAnchorKey + '\r\n${content}\r\n});',
    kissy: 'KISSY.add("${moduleId}",function(S,${vars}){\r\n${content}\r\n},\r\n{requires:[${requires}' + reqsAnchorKey + ']});',
    kissy_es: 'KISSY.add("${moduleId}",(S,${vars})=>{\r\n${content}\r\n},\r\n{requires:[${requires}' + reqsAnchorKey + ']});',
    webpack: '' + varsAnchorKey + '\r\n${content}',
    none: '${content}',
    module: varsAnchorKey + '\r\n${content}',
    iife: '(function(){\r\n${content}\r\n})();',
    iife_es: '(()=>{\r\n${content}\r\n})();'
};
module.exports = e => {
    e.requiresAnchorKey = reqsAnchorKey;
    e.varsAnchorKey = varsAnchorKey;
    e.addedWrapper = true;
    let loader = e.loader;
    let tmpl = header + (tmpls[loader] || tmpls.iife);
    for (let p in e) {
        let reg = regexp.get('(,?)\\$\\{' + p + '\\}', 'g');
        let v = e[p];
        tmpl = tmpl.replace(reg, (m, c) => {
            if (c) {
                if (v && v.length) {
                    return c + v;
                }
                return '';
            }
            return v;
        });
    }
    if (loader == 'kissy') {
        tmpl = tmpl.replace(exportsReg, 'return ');
    }
    return tmpl;
};