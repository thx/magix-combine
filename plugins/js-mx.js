/*
    处理mx后缀的单文件
 */
let path = require('path');
let templateReg = /<template>([\s\S]+?)<\/template>/i;
let styleReg = /<style([^>]*)>([\s\S]+?)<\/style>/i;
let scriptReg = /<script[^>]*>([\s\S]+?)<\/script>/i;
let styleTypeReg = /\btype\s*=\s*(['"])([^'"]+)\1/i;
let styleLangReg = /\blang\s*=\s*(["'])([^'"]+)\1/i;
let styleTypesMap = {
    'text/less': '.less',
    'text/scss': '.scss',
    'less': '.less',
    'scss': 'scss'
};
module.exports = {
    process(content, from) {
        let template, style, script, type;
        let temp = content.match(templateReg);
        let fileName = path.basename(from);
        if (temp) {
            template = temp[1];
        } else {
            template = 'unfound inline ' + fileName + ' template, may be missing root tag:"template"';
        }
        temp = content.match(styleReg);
        if (temp) {
            type = temp[1];
            style = temp[2];
            if (type) {
                temp = type.match(styleLangReg);
                if (temp) {
                    type = temp[2];
                    type = styleTypesMap[type];
                } else {
                    temp = type.match(styleTypeReg);
                    if (temp) {
                        type = temp[2];
                        type = styleTypesMap[type];
                    }
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