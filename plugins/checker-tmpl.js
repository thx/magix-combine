let slog = require('./util-log');
let configs = require('./util-config');
let fcache = require('./util-fcache');
/**
 * Camelize a hyphen-delimited string.
 */
let camelizeRE = /-(\w)/g;
let camelize = fcache(str => {
    return str.replace(camelizeRE, (_, c) => {
        return c ? c.toUpperCase() : '';
    });
});

/**
 * Hyphenate a camelCase string.
 */
var hyphenateRE = /([^-])([A-Z])/g;
var hyphenate = fcache(str => {
    return str
        .replace(hyphenateRE, '$1-$2')
        .toLowerCase();
});
module.exports = {
    upperCaseReg: /[A-Z]/g,
    camelize,
    hyphenate,
    markAttr() {
        if (configs.check) {
            slog.ever.apply(slog, arguments);
        }
    },
    markVarReassign(reassigns) {
        if (reassigns && configs.check) {
            reassigns.forEach(it => {
                slog.ever(it);
            });
        }
    },
    markTmplExpr() {
        if (configs.check) {
            slog.ever.apply(slog, arguments);
        }
    },
    markTmplBind() {
        if (configs.check) {
            slog.ever.apply(slog, arguments);
        }
    }
};