let checker = require('./checker');
let numReg = /^\d+$/;
let selfCssReg = /@[\$:]\(([\w\-]+)\)/g;
module.exports = (tmpl, e, locker = Object.create(null)) => {
    let selfCssClass = (m, key) => {
        if (numReg.test(key)) return m;
        let r = e.cssNamesMap[key];
        if (!locker[key]) {
            locker[key] = 1;
            if (r) {
                let files = e.cssNamesInFiles[key + '!r'];
                checker.CSS.markUsed(files, key, e.from);
            } else {
                checker.CSS.markUndeclared(e.srcHTMLFile, key);
            }
        }
        return r || key;
    };
    return tmpl.replace(selfCssReg, selfCssClass);
};