let path = require('path');
let fs = require('fs');
let fd = require('./util-fd');
let bareReg = /(['"`])bare\x12@([\w\.\-\/\\]+)\1/g;
module.exports = e => {
    return new Promise(resolve => {
        let tasks = [],
            tasksCount = 0,
            completed = 0;
        let locker = Object.create(null);
        let folder = path.dirname(e.from);
        let resume = () => {
            e.content = e.content.replace(bareReg, m => {
                m = locker[m];
                return JSON.stringify(m);
            });
            resolve(e);
        };
        let readContent = task => {
            fs.access(task[1], (fs.constants ? fs.constants.R_OK : fs.R_OK), e => {
                completed++;
                if (e) {
                    locker[task[0]] = `can not find ${task[2]}`;
                } else {
                    locker[task[0]] = fd.read(task[1]);
                }
                if (tasksCount == completed) {
                    resume();
                }
            });
        };
        let doTasks = () => {
            if (tasksCount > 0) {
                for (let t of tasks) {
                    readContent(t);
                }
            } else {
                resolve(e);
            }
        };
        e.content.replace(bareReg, (m, q, name) => {
            let file = path.resolve(folder + path.sep + name);
            if (!locker[m]) {
                tasksCount++;
                locker[m] = 'waiting file read';
                tasks.push([m, file, name]);
            }
        });
        doTasks();
    });
};