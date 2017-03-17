//处理mx后缀的文件
var path = require('path');
var templateReg = /<template>([\s\S]+?)<\/template>/i;
var styleReg = /<style([^>]*)>([\s\S]+?)<\/style>/i;
var scriptReg = /<script[^>]*>([\s\S]+?)<\/script>/i;
var styleTypeReg = /type\s*=(['"])([^'"]+)\1/;
var styleTypesMap = {
    'text/less': '.less',
    'text/sass': '.sass'
};
module.exports = {
    process: function(content, from) {
        var template, style, script, type;
        var temp = content.match(templateReg);
        var fileName = path.basename(from);
        if (temp) {
            template = temp[1];
        } else {
            template = 'unfound inline ' + fileName + ' template';
        }
        temp = content.match(styleReg);
        if (temp) {
            type = temp[1];
            style = temp[2];
            if (type) {
                temp = type.match(styleTypeReg);
                if (temp) {
                    type = temp[2];
                    type = styleTypesMap[type];
                }
            }
            if (!type) {
                type = '.css';
            }
        } else {
            style = '';
        }
        temp = content.match(scriptReg);
        if (temp) {
            script = temp[1];
        } else {
            script = 'unfound script';
        }
        return {
            fileName: fileName,
            template: template,
            style: style,
            styleType: type,
            script: script
        };
    }
};