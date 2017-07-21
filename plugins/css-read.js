/*
    读取样式文件内容，如果是sass,less等则进行编译后返回
 */
let fs = require('fs');
let path = require('path');

let less = require('less');
let sass = require('node-sass');

let utils = require('./util');
let slog = require('./util-log');
let configs = require('./util-config');
let fd = require('./util-fd');

let jsMx = require('./js-mx');

let compileContent = (file, content, ext, cssCompileConfigs, resolve, reject) => {
    if (ext == '.scss') {
        configs.sassOptions.data = content;
        sass.render(cssCompileConfigs, (err, result) => {
            if (err) {
                slog.ever('scss error:', (err + '').red);
                return reject(err);
            }
            resolve({
                exists: true,
                file: file,
                content: err || result.css.toString()
            });
        });
    } else if (ext == '.less') {
        less.render(content, cssCompileConfigs, (err, result) => {
            if (err) {
                slog.ever('less error:', (err + '').red);
                return reject(err);
            }
            resolve({
                exists: true,
                file: file,
                content: err || result.css
            });
        });
    } else if (ext == '.css') {
        resolve({
            exists: true,
            file: file,
            content: content
        });
    } else if (ext == '.mx') {
        content = fd.read(file);
        let info = jsMx.process(content, file);
        compileContent(file, info.style, info.styleType, resolve, reject);
    }
};
//css 文件读取模块，我们支持.css .less .scss文件，所以该模块负责根据文件扩展名编译读取文件内容，供后续的使用
module.exports = (file, name, e) => {
    return new Promise((resolve, reject) => {
        let info = e.contentInfo;
        let styleType = info && info.styleType || path.extname(file);
        let cssCompileConfigs = {};
        if (styleType == '.less') {
            utils.cloneAssign(cssCompileConfigs, configs.lessOptions);
            cssCompileConfigs.paths = [path.dirname(file)];
        } else if (styleType == '.scss') {
            utils.cloneAssign(cssCompileConfigs, configs.sassOptions);
            cssCompileConfigs.file = file;
        }
        if (info && name == 'style') {
            compileContent(file, info.style, styleType, cssCompileConfigs, resolve, reject);
        } else {
            fs.access(file, (fs.constants ? fs.constants.R_OK : fs.R_OK), err => {
                if (err) {
                    resolve({
                        exists: false,
                        file: file,
                        content: ''
                    });
                } else {
                    let fileContent = fd.read(file);
                    compileContent(file, fileContent, styleType, cssCompileConfigs, resolve, reject);
                }
            });
        }
    });
};