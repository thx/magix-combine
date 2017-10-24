/*
    处理mx后缀的单文件
 */
let path = require('path');
let attrType = require('./tmpl-attr-type');
let templateReg = /<template([^>]*)>([\s\S]+?)<\/template>/i;
let styleReg = /<style([^>]*)>([\s\S]+?)<\/style>/i;
let scriptReg = /<script[^>]*>([\s\S]+?)<\/script>/i;
module.exports = {
    process(content, from) {
        let template, style, script, type, templateTag, styleTag;
        let temp = content.match(templateReg);
        let fileName = path.basename(from);
        let templateLang = 'html';
        if (temp) {
            template = temp[2];
            let lang = temp[1];
            if (lang) {
                templateTag = '<template' + lang + '>';
                lang = attrType.extractLang(lang);
                if (lang) {
                    templateLang = lang;
                }
            } else {
                templateTag = '<template>';
            }
        } else {
            template = 'unfound inline ' + fileName + ' template, may be missing root tag:"template"';
            templateTag = '';
        }
        temp = content.match(styleReg);
        if (temp) {
            type = temp[1];
            style = temp[2];
            if (type) {
                styleTag = '<style' + type + '>';
                type = attrType.extractLang(type);
            } else {
                styleTag = '<style>';
            }
            if (!type) {
                type = 'css';
            }
            type = '.' + type;
        } else {
            style = '';
            styleTag = '';
        }
        temp = content.match(scriptReg);
        if (temp) {
            script = temp[1];
        } else {
            script = 'unfound script';
        }
        return {
            fileName,
            template,
            templateTag,
            templateLang,
            style,
            styleType: type,
            styleTag,
            script
        };
    }
};