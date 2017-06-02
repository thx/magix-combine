let css = require('./checker-css');
var tmpl = require('./checker-tmpl');
module.exports = {
    CSS: css,
    Tmpl: tmpl,
    output() {
        css.output();
    }
};