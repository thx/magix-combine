/*
    js中依赖处理
    允许通过resolveRequire进行依赖重写
 */
//分析js中的require命令
//let a=require('aa');
//var b;
//b=require('cc');
let jsModuleParser = require('./js-module-parser');
let configs = require('./util-config');
let atpath = require('./util-atpath');

let depsReg = /(?:(?:(?:(?:var|let|const)\s+|,|\s)\s*[^=\s]+\s*=\s*)?\brequire\s*\([^\(\)]+\)|\bimport\s+[^;\r\n]+)[\r\n;,]?|\bimport\s*\([^\(\);\r\n]+\)/g;
let importReg = /import\s+(?:([^;\r\n]+?)from\s+)?(['"])([^'"]+)\2([\r\n;,])?/;
let requireReg = /(?:((?:var|let|const)\s+|,|\s|^)\s*([^=\s]+)\s*=\s*)?\brequire\s*\(\s*(['"])([^\(\)]+)\3\s*\)([\r\n;,\s])?/;
let dimportReg = /import\s*\(([^\(\);\r\n]+)\)/;
let styleReg = /^(global|ref|names)?@?([\w\.\-\/\\]+?(?:\.css|\.less|\.scss|\.sass|\.mx|\.mmx|\.style))$/;
let noncharReg = /[^a-zA-Z\d]/g;
let removeRequiresLoader = {
    kissy: 1,
    kissy_es: 1
};
module.exports = {
    process(e) {
        let deps = [];
        let vars = [];
        let noKeyDeps = [];
        let nearestMagixVarName = 'Magix';
        let prepend = '';
        if (e.addWrapper) {
            let depsInfo = jsModuleParser.process(e.content);
            depsInfo = depsInfo.reverse();
            e.content = e.content.replace(depsReg, (match, offset) => {
                if (depsInfo.length) {
                    let last = depsInfo[depsInfo.length - 1].moduleStart;
                    // var require=require('cc'); => offset=0  offset+match.length==26
                    // depsInfo[0] in range [0,26] ?
                    if (offset < last && last < (offset + match.length)) {
                        let info = depsInfo.pop();
                        let m;
                        let vId, mId, prefix, tail, dynamicVId = 0;
                        if (info.type == 'require') {
                            m = match.match(requireReg);
                            prefix = m[1] || '';
                            vId = m[2] || '';
                            mId = m[4];
                            tail = m[5] || '';
                        } else if (info.type == 'import') {
                            m = match.match(importReg);
                            prefix = 'import ';
                            vId = m[1] || '';
                            mId = m[3];
                            tail = m[4] || '';
                        } else if (info.type == 'dimport') {
                            m = match.match(dimportReg);
                            prefix = 'import(';
                            tail = ')';
                            vId = '';
                            mId = m[1];
                        }
                        //是否是magix模块
                        let isMagix = configs.magixModuleIds.indexOf(mId) !== -1;
                        //如果是magix模板或移除require语句
                        if (isMagix || removeRequiresLoader[e.loader]) {
                            //如果依赖是参数或且不存在变量声明
                            if (info.isParam && !vId) {
                                dynamicVId = 1;//动态变量
                                vId = '$dynamic_name_' + mId.replace(noncharReg, '_');
                            }
                            if (isMagix) {
                                nearestMagixVarName = vId;
                            }
                        }
                        if (info.isParam &&
                            isMagix &&
                            !removeRequiresLoader[e.loader]) {
                            prepend = this.getImport({
                                prefix: 'let ',
                                tail: ';\n',
                                vId,
                                mId,
                                type: 'require'
                            }, e);
                        }
                        let reqInfo = {
                            prefix,
                            tail,
                            raw: match,
                            type: info.type,
                            vId,
                            dynamicVId,
                            mId,
                            magix: nearestMagixVarName
                        };
                        let replacement = this.getReqReplacement(reqInfo, e);
                        if (reqInfo.mId &&
                            !reqInfo.isCss &&
                            reqInfo.type != 'dimport') {
                            let dId = JSON.stringify(reqInfo.mId);
                            if (reqInfo.vId) {
                                deps.push(dId);
                                vars.push(reqInfo.vId);
                            } else {
                                noKeyDeps.push(dId);
                            }
                        }
                        return replacement;
                    }
                }
                return match;
            });
            deps = deps.concat(noKeyDeps);
        }
        e.content = prepend + e.content;
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        return Promise.resolve(e);
    },
    getImport(reqInfo, e) {
        if (!reqInfo.mId.startsWith('.')) {
            let i = reqInfo.mId.indexOf('/');
            if (i > -1) {
                if (reqInfo.mId.substring(0, i) === e.pkgName) {
                    let p = atpath.resolvePath('"@' + reqInfo.mId + '"', e.moduleId);
                    reqInfo.mId = p.slice(1, -1);
                }
            }
        }
        let dId = reqInfo.type == 'dimport' ? reqInfo.mId : JSON.stringify(reqInfo.mId);
        let replacement = reqInfo.prefix;
        if (reqInfo.vId) {
            replacement += reqInfo.vId;
            if (reqInfo.type == 'import') {
                replacement += ' from ';
            } else {
                replacement += ' = ';
            }
        }
        if (reqInfo.type == 'require') {
            replacement += 'require(';
        }
        replacement += dId;
        if (reqInfo.type == 'require') {
            replacement += ')';
        }
        replacement += reqInfo.tail;
        return replacement;
    },
    getReqReplacement(reqInfo, e) {
        configs.resolveRequire(reqInfo, e);
        if (reqInfo.hasOwnProperty('replacement')) {
            return reqInfo.replacement;
        }
        if (!reqInfo.mId) {
            return '';
        }
        if (configs.importCssSyntax) {
            let sm = reqInfo.mId.match(styleReg);
            if (sm) {
                let [, prefix, name] = sm;
                let dId = reqInfo.mId;
                let replacement = reqInfo.prefix;
                if (prefix) {
                    dId = JSON.stringify(dId);
                } else {
                    dId = `${reqInfo.magix}.applyStyle(${JSON.stringify('@' + name)})`;
                }
                if (reqInfo.vId) {
                    replacement += reqInfo.vId + ' = ';
                }
                reqInfo.isCss = true;
                return replacement + dId + reqInfo.tail;
            }
        }
        if (reqInfo.dynamicVId) {
            return reqInfo.vId;
        }
        //kissy要删除require信息
        if (removeRequiresLoader[e.loader]) {
            return '';
        }
        return this.getImport(reqInfo, e);
    }
};