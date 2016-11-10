var configs = require('./util-config');
//模板代码片断的处理，较少用
var snippetReg = /<mx-(\w+)[^>]*>[\s\S]*?<\/mx-\1>/g;
module.exports = {
    process: function(tmpl) {
        var compare;
        while (snippetReg.test(tmpl)) {
            compare = tmpl.replace(snippetReg, configs.mxTagProcessor);
            if (compare == tmpl) {
                break;
            } else {
                tmpl = compare;
            }
        }
        return tmpl;
    }
};