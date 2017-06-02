let slog = require('./util-log');
let configs = require('./util-config');
module.exports = {
    markViewAttr() {
        if (configs.check) {
            slog.ever.apply(slog, arguments);
        }
    },
    markNodeAttr() {
        if (configs.check) {
            slog.ever.apply(slog, arguments);
        }
    },
    markVarReassign(reassigns) {
        if (reassigns && configs.check) {
            reassigns.forEach((it) => {
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