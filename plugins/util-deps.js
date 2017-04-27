//文件依赖信息对象，如index.js中@了index.css，则index.css被修改时，我们要编译index.js，即被依赖的模块变化要让有依赖的模块编译一次
let fileDependencies = {};
let context;
//添加文件依赖关系
let addFileDepend = (file, dependFrom, dependTo) => {
    if (file != dependFrom) {
        let list = fileDependencies[file];
        if (!list) {
            list = fileDependencies[file] = {};
        }
        list[dependFrom] = dependTo;
    }
};
//运行依赖列表
let runFileDepend = (file) => {
    let list = fileDependencies[file];
    let promises = [];
    if (list) {
        for (let p in list) {
            promises.push(context.process(p, list[p], true));
        }
    }
    return Promise.all(promises);
};
//移除文件依赖
let removeFileDepend = (file) => {
    delete fileDependencies[file];
};

module.exports = {
    setContext(ctx) {
        context = ctx;
        return ctx;
    },
    inDependencies(file) {
        return fileDependencies.hasOwnProperty(file);
    },
    getDependencies(file) {
        return fileDependencies[file];
    },
    removeFileDepend: removeFileDepend,
    runFileDepend: runFileDepend,
    addFileDepend: addFileDepend
};