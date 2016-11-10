var fs = require('fs');
var path = require('path');
var sep = path.sep;
var writeFile = function(to, content) { //文件写入
    var folders = path.dirname(to).split(sep);
    var p = '';
    while (folders.length) {
        p += folders.shift() + sep;
        if (!fs.existsSync(p)) {
            fs.mkdirSync(p);
        }
    }
    fs.writeFileSync(to, content);
};
var copyFile = function(from, to) { //复制文件
    if (fs.existsSync(from)) {
        var content = readFile(from, true);
        writeFile(to, content);
    }
};
var walk = function(folder, callback) { //遍历文件夹及子、孙文件夹下的文件
    var files = fs.readdirSync(folder);
    files.forEach(function(file) {
        var p = folder + sep + file;
        var stat = fs.lstatSync(p);
        if (stat.isDirectory()) {
            walk(p, callback);
        } else {
            callback(p);
        }
    });
};

var readFile = function(file, original) { //读取文件
    var c = fs.readFileSync(file);
    if (!original) c = c + '';
    return c;
};
module.exports = {
    write: writeFile,
    copy: copyFile,
    walk: walk,
    read: readFile
};