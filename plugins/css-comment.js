let utils = require('./util');
let regexp = require('./util-rcache');
let cssCommentReg = /\/\*[\s\S]+?\*\//g;
module.exports = {
    store(css, refStore) {
        let key = utils.uId('\x00', css);
        let count = 0;
        css = css.replace(cssCommentReg, m => {
            let k = '/*' + key + '$' + (count++) + '*/';
            refStore[k] = m;
            return k;
        });
        refStore.__reg = regexp.get(regexp.escape('/*' + key) + '\\$\\d+\\*\\/', 'g');
        return css;
    },
    recover(css, refStore) {
        return css.replace(refStore.__reg, m => {
            return refStore[m] || '';
        });
    }
};