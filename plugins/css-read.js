var fs = require('fs');
var path = require('path');

var less = require('less');
var sass = require('node-sass');

var configs = require('./util-config');
var fd = require('./util-fd');

var jsMx = require('./js-mx');
//css 文件读取模块，我们支持.css .less .scss文件，所以该模块负责根据文件扩展名编译读取文件内容，供后续的使用
module.exports = function(file, name, e) {
    return new Promise(function(resolve) {
        if (e.contentInfo && name == 'style') {
            resolve({
                exists: true,
                content: e.contentInfo.style
            });
            return;
        }
        fs.access(file, (fs.constants ? fs.constants.R_OK : fs.R_OK), function(err) {
            if (err) {
                resolve({
                    exists: false
                });
            } else {
                var ext = path.extname(file);
                var fileContent;
                if (ext == '.scss') {
                    configs.sassOptions.file = file;
                    sass.render(configs.sassOptions, function(err, result) {
                        if (err) {
                            console.log('scss error:', err);
                        }
                        resolve({
                            exists: true,
                            content: err || result.css.toString()
                        });
                    });
                } else if (ext == '.less') {
                    fileContent = fd.read(file);
                    configs.lessOptions.paths = [path.dirname(file)];
                    less.render(fileContent, configs.lessOptions, function(err, result) {
                        if (err) {
                            console.log('less error:', err);
                        }
                        resolve({
                            exists: true,
                            content: err || result.css
                        });
                    });
                } else if (ext == '.css') {
                    fileContent = fd.read(file);
                    resolve({
                        exists: true,
                        content: fileContent
                    });
                } else if (ext == '.mx') {
                    fileContent = fd.read(file);
                    var info = jsMx.process(fileContent, file);
                    resolve({
                        exists: true,
                        content: info.style
                    });
                }
            }
        });
    });
};