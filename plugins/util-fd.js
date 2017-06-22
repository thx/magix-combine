let fs = require('fs');
let path = require('path');
let sep = path.sep;

let readFile = (file, original) => { //读取文件
    let c = fs.readFileSync(file);
    if (!original) c = c + '';
    return c;
};

let writeFile = (to, content) => { //文件写入
    let folders = path.dirname(to).split(sep);
    let p = '';
    while (folders.length) {
        p += folders.shift() + sep;
        if (!fs.existsSync(p)) {
            fs.mkdirSync(p);
        }
    }
    fs.writeFileSync(to, content);
};
let copyFile = (from, to) => { //复制文件
    if (fs.existsSync(from)) {
        let content = readFile(from, true);
        writeFile(to, content);
    }
};
let walk = (folder, callback) => { //遍历文件夹及子、孙文件夹下的文件
    let files = fs.readdirSync(folder);
    files.forEach(file => {
        let p = folder + sep + file;
        let stat = fs.lstatSync(p);
        if (stat.isDirectory()) {
            walk(p, callback);
        } else {
            callback(p);
        }
    });
};

module.exports = {
    write: writeFile,
    copy: copyFile,
    walk: walk,
    read: readFile
};