//模板，处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理

let configs = require('./util-config');
let cssChecker = require('./css-checker');
let classReg = /\bclass\s*=\s*(['"])([^'"]+)(?:\1)/g;
let classNameReg = /(\s|^|\u0007)([\w\-]+)(?=\s|$|\u0007)/g;
let pureTagReg = /<[^>\s\/]+[^>]*>/g;
let selfCssReg = /@:([\w\-]+)/g;
let numReg = /^\d+$/;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let Tmpl_Mathcer = /<%([=!])?([\s\S]+?)%>/g;
let stringReg = /\u0017([^\u0017]+?)\u0017/g;
module.exports = {
    process(tmpl, cssNamesMap, refTmplCommands, e) {
        let tempCache = {};
        let classResult = (m, h, key) => {
            if (numReg.test(key)) return m; //纯数字的是模板命令，选择器不可能是纯数字
            let r = cssNamesMap[key];
            if (!tempCache[key]) {
                tempCache[key] = 1;
                if (r) {
                    let files = e.cssNamesInFiles[key + '!r'];
                    cssChecker.markUsed(files, key, e.from);
                } else {
                    cssChecker.markUndeclared(e.srcHTMLFile, key);
                }
            }
            return h + (r || key);
        };
        let cmdProcessor = (m, key) => {
            return key.replace(classNameReg, classResult);
        };
        let classProcessor = (m, q, c) => {
            if (tmplCommandAnchorReg.test(m)) {
                m.replace(tmplCommandAnchorReg, (tm) => {
                    let cmd = refTmplCommands[tm];
                    if (Tmpl_Mathcer.test(cmd)) {
                        refTmplCommands[tm] = cmd.replace(stringReg, cmdProcessor);
                    }
                });
            }
            return 'class=' + q + c.replace(classNameReg, classResult) + q;
        };
        let selfCssClass = (m, key) => {
            if (numReg.test(key)) return m;
            let r = cssNamesMap[key];
            if (!tempCache[key]) {
                tempCache[key] = 1;
                if (r) {
                    let files = e.cssNamesInFiles[key + '!r'];
                    cssChecker.markUsed(files, key, e.from);
                } else {
                    cssChecker.markUndeclared(e.srcHTMLFile, key);
                }
            }
            return r || key;
        };
        let pureProcessor = (match) => {
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