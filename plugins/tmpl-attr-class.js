/*
    处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理
 */
let configs = require('./util-config');
let checker = require('./checker');
let deps = require('./util-deps');
let classReg = /\bclass\s*=\s*"([^"]+)"/g;
let classNameReg = /(\s|^|\u0007)([\w\-]+)(?=\s|$|\u0007)/g;
let pureTagReg = /<([^>\s\/]+)([^>]*)>/g;
let selfCssReg = /@\$([\w\-]+)/g;
let numReg = /^\d+$/;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let tmplCmdReg = /<%([=!])?([\s\S]+?)%>/;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let attrReg = /([\w\-:]+)(?:=(["'])[\s\S]*?\2)?/g;
module.exports = {
    process(tmpl, cssNamesMap, refTmplCommands, e) {
        let tempCache = Object.create(null);
        let tagsCache = Object.create(null);
        let classResult = (m, h, key) => {
            if (numReg.test(key)) return m; //纯数字的是模板命令，选择器不可能是纯数字
            let r = cssNamesMap[key];
            if (!tempCache[key]) {
                tempCache[key] = 1;
                if (r) {
                    let files = e.cssNamesInFiles[key + '!r'];
                    checker.CSS.markUsed(files, key, e.from);
                    files.forEach(f => {
                        deps.addFileDepend(f, e.from, e.to);
                    });
                } else {
                    checker.CSS.markUndeclared(e.srcHTMLFile, key);
                }
            }
            return h + (r || key);
        };
        let cmdProcessor = (m, key) => {
            if (key) {
                return key.replace(classNameReg, classResult);
            }
            return key;
        };
        let classProcessor = (m, c) => {
            if (tmplCommandAnchorReg.test(m)) {
                tmplCommandAnchorReg.lastIndex = 0;
                m.replace(tmplCommandAnchorReg, tm => {
                    let cmd = refTmplCommands[tm];
                    if (cmd && tmplCmdReg.test(cmd)) {
                        refTmplCommands[tm] = cmd.replace(stringReg, cmdProcessor);
                    }
                });
            }
            return 'class="' + c.replace(classNameReg, classResult) + '"';
        };
        let selfCssClass = (m, key) => {
            if (numReg.test(key)) return m;
            let r = cssNamesMap[key];
            if (!tempCache[key]) {
                tempCache[key] = 1;
                if (r) {
                    let files = e.cssNamesInFiles[key + '!r'];
                    checker.CSS.markUsed(files, key, e.from);
                } else {
                    checker.CSS.markUndeclared(e.srcHTMLFile, key);
                }
            }
            return r || key;
        };
        let pureProcessor = (match, tag, content) => {
            content.replace(attrReg, (m, name) => {
                let attr = '[' + name + ']';
                if (!tagsCache[attr]) {
                    tagsCache[attr] = 1;
                    let files = e.cssTagsInFiles[attr];
                    if (files) {
                        checker.CSS.markUsedTags(Object.keys(files), attr, e.from);
                    }
                }
            });
            if (!tagsCache[tag]) {
                tagsCache[tag] = 1;
                let files = e.cssTagsInFiles[tag];
                if (files) {
                    checker.CSS.markUsedTags(Object.keys(files), tag, e.from);
                }
            }
            match = configs.cssNamesProcessor(match, cssNamesMap);
            match = match.replace(classReg, classProcessor); //保证是class属性
            return match.replace(selfCssReg, selfCssClass);
        };
        if (cssNamesMap) {
            //为了保证安全，我们一层层进入
            tmpl = tmpl.replace(pureTagReg, pureProcessor); //保证是标签
        }
        return tmpl;
    }
};