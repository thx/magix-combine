let typeReg = /\btype\s*=\s*(['"])([^'"]+)\1/i;
let langReg = /\blang\s*=\s*(["'])([^'"]+)\1/i;
module.exports = {
    extractLang(src) {
        let lang = null;
        let temp = src.match(typeReg);
        if (temp) {
            lang = temp[2];
            if (lang.indexOf('text/') === 0) {
                lang = lang.slice(5);
            }
        } else {
            temp = src.match(langReg);
            if (temp) {
                lang = temp[2];
            }
        }
        return lang;
    }
};