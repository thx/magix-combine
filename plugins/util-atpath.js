var path = require('path');
var sep = path.sep;
var sepRegTmpl = sep.replace(/\\/g, '\\\\');
var sepReg = new RegExp(sepRegTmpl, 'g');
//以@开头的路径转换
var relativePathReg = /(['"])@([^\/]+)([^\s;\(\)\{\}]+?)(?=\\?\1)/g;
//处理@开头的路径，如果是如'@coms/dragdrop/index'则转换成相对当前模块的相对路径，如果是如 mx-view="@./list" 则转换成 mx-view="app/views/reports/list"完整的模块路径
var resolveAtPath = function(content, from) {
    var folder = from.substring(0, from.lastIndexOf('/') + 1);
    var tp;
    return content.replace(relativePathReg, function(m, q, l, p) {
        if (l.charAt(0) == '.') //以.开头我们认为是相对路径，则转完整模块路径
            tp = q + path.normalize(folder + l + p);
        else
            tp = q + path.relative(folder, l + p);
        tp = tp.replace(sepReg, '/');
        return tp;
    });
};
//处理@名称，如'@../default.css'
var resolveAtName = function(name, moduleId) {
    if (name.indexOf('/') >= 0 && name.charAt(0) != '.') {
        name = resolveAtPath('"@' + name + '"', moduleId).slice(1, -1);
    }
    //console.log('resolveAtName', name);
    return name;
};

module.exports = {
    resolvePath: resolveAtPath,
    resolveName: resolveAtName
};