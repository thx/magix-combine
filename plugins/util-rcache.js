/*
    正则
 */
let cache = Object.create(null);
let escapeReg = /[\-#$\^*()+\[\]{}|\\,.?\s]/g;
let $reg = /\$/g;
module.exports = {
    escape(expr) {
        return (expr + '').replace(escapeReg, '\\$&');
    },
    encode(expr) {
        return (expr + '').replace($reg, '$&$&');
    },
    get(expr, flags) {
        let key = expr + '\u0000' + flags;
        let reg = cache[key] || (cache[key] = new RegExp(expr, flags || ''));
        reg.lastIndex = 0;
        return reg;
    }
};