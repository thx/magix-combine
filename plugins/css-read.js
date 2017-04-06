var fs = require('fs');
var path = require('path');

var less = require('less');
var sass = require('node-sass');

var configs = require('./util-config');
var fd = require('./util-fd');

var jsMx = require('./js-mx');

var compileContent = function(file, content, ext, resolve, reject) {
    if (ext == '.scss') {
        configs.sassOptions.data = content;
        sass.render(configs.sassOptions, function(err, result) {
            if (err) {
                console.log('scss error:', err);
                reject(err);
            }
            resolve({
                exists: true,
                file: file,
                content: err || result.css.toString()
            });
        });
    } else if (ext == '.less') {
        less.render(content, configs.lessOptions, function(err, result) {
            if (err) {
                console.log('less error:', err, '----', content);
                reject(err);
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
        var info = jsMx.process(content, file);
        compileContent(file, info.style, info.styleType, resolve, reject);
    }
};
//css 文件读取模块，我们支持.css .less .scss文件，所以该模块负责根据文件扩展名编译读取文件内容，供后续的使用
module.exports = function(file, name, e) {
    return new Promise(function(resolve, reject) {
        var ext = path.extname(file);
        if (e.contentInfo && name == 'style') {
            var info = e.contentInfo;
            var type = info.styleType;
            if (type == '.css' && ext != '.css') {
                type = ext;
            }
            compileContent(file, info.style, info.styleType, resolve, reject);
            return;
        }
        fs.access(file, (fs.constants ? fs.constants.R_OK : fs.R_OK), function(err) {
            if (err) {
                resolve({
                    exists: false
                });
            } else {
                var fileContent = fd.read(file);
                if (ext == '.less') {
                    configs.lessOptions.paths = [path.dirname(file)];
                } else if (ext == '.scss') {
                    configs.sassOptions.file = file;
                }
                compileContent(file, fileContent, ext, resolve, reject);
            }
        });
    });
};