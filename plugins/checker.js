let css = require('./checker-css');
let tmpl = require('./checker-tmpl');
let js = require('./checker-js');
module.exports = {
    CSS: css,
    Tmpl: tmpl,
    JS: js,
    output() {
        css.output();
    }
};