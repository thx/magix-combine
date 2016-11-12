//文件依赖信息对象，如index.js中@了index.css，则index.css被修改时，我们要编译index.js，即被依赖的模块变化要让有依赖的模块编译一次
var fileDependencies = {};
var context;
//添加文件依赖关系
var addFileDepend = function(file, dependFrom, dependTo) {
    var list = fileDependencies[file];
    if (!list) {
        list = fileDependencies[file] = {};
    }
    list[dependFrom] = dependTo;
};
//运行依赖列表
var runFileDepend = function(file) {
    var list = fileDependencies[file];
    var promises = [];
    if (list) {
        for (var p in list) {
            promises.push(context.process(p, list[p], true));
        }
    }
    return Promise.all(promises);
};
//移除文件依赖
var removeFileDepend = function(file) {
    delete fileDependencies[file];
};

module.exports = {
    setContext: function(ctx) {
        context = ctx;
        return ctx;
    },
    inDependencies: function(file) {
        return fileDependencies.hasOwnProperty(file);
    },
    removeFileDepend: removeFileDepend,
    runFileDepend: runFileDepend,
    addFileDepend: addFileDepend
};