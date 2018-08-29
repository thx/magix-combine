/*
    处理代码片断，如'top@./list.js'，用于手动合并一些代码
 */
let deps = require('./util-deps');
let configs = require('./util-config');
let path = require('path');
let fs = require('fs');
let sep = path.sep;
let fileReg = /(['"])([a-z,]+)?\u0012@([^'"]+)\.([a-z]{2,})\1;?/g;
let checker = require('./checker');
module.exports = e => {
    return new Promise((resolve, reject) => {
        let contentCache = Object.create(null),
            count = 0,
            resumed = false;
        let resume = () => {
            if (!resumed) {
                resumed = true;
                e.content = e.content.replace(fileReg, m => {
                    return contentCache[m] || m;
                });
                resolve(e);
            }
        };
        let readFile = (key, file, ctrl) => {
            count++;
            let to = path.resolve(configs.compiledFolder + file.replace(configs.moduleIdRemovedPath, ''));
            if (fs.existsSync(file)) {
                let ctrls = ctrl.split(',');
                let c = {};
                for (let r of ctrls) {
                    c[r] = true;
                }
                e.processContent(file, to, '', false, c).then(info => {
                    contentCache[key] = info.content;
                    count--;
                    if (!count) {
                        resume();
                    }
                }).catch(reject);
            } else {
                checker.CSS.markUnexists(file, e.from);
                contentCache[key] = 'throw new Error("unfound:' + file + '");';
                count--;
                if (!count) {
                    resume();
                }
            }
        };
        let tasks = [];
        e.content.replace(fileReg, (m, q, ctrl, name, ext) => {
            let file = path.resolve(path.dirname(e.from) + sep + name + '.' + ext);
            if (e.from && e.to) {
                deps.addFileDepend(file, e.from, e.to);
            }
            tasks.push([m, file, ctrl || '']);
        });
        if (tasks.length) {
            let i = 0;
            while (i < tasks.length) {
                readFile.apply(null, tasks[i++]);
            }
        } else {
            resume();
        }
    });
};