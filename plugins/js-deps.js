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

let depsReg = /(?:(?:(?:var\s+|let\s+|const\s+)?[^\r\n]+?)?\brequire\s*\([^\(\)]+\)|\bimport\s+[^;\r\n]+)[\r\n;,]?/g;
let importReg = /import\s+(?:([^;\r\n]+?)from\s+)?(['"])([^'"]+)\2([\r\n;,])?/;
let requireReg = /(?:((?:var|let|const)\s+|,|\s|^)\s*([^=\s]+)\s*=\s*)?\brequire\s*\(\s*(['"])([^\(\)]+)\3\s*\)([\r\n;,])?/;
let removeRequiresLoader = {
    kissy: 1,
    kissy_es: 1
};
module.exports = {
    process(e) {
        let deps = [];
        let vars = [];
        let noKeyDeps = [];
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
                        let vId, mId, prefix, tail;
                        if (info.type == 'require') {
                            m = match.match(requireReg);
                            prefix = m[1] || '';
                            vId = m[2] || '';
                            mId = m[4];
                            tail = m[5] || '';
                        } else {
                            m = match.match(importReg);
                            prefix = 'import ';
                            vId = m[1] || '';
                            mId = m[3];
                            tail = m[4] || '';
                        }
                        let reqInfo = {
                            prefix,
                            tail,
                            raw: match,
                            type: info.type,
                            vId,
                            mId
                        };
                        let replacement = this.getReqReplacement(reqInfo, e);
                        if (reqInfo.mId) {
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
        e.deps = deps;
        e.vars = vars;
        e.requires = deps;
        return Promise.resolve(e);
    },
    getReqReplacement(reqInfo, e) {
        configs.resolveRequire(reqInfo, e);
        if (reqInfo.hasOwnProperty('replacement')) {
            return reqInfo.replacement;
        }
        //kissy要删除require信息
        if (removeRequiresLoader[e.loader] || !reqInfo.mId) {
            return '';
        }
        if (!reqInfo.mId.startsWith('.')) {
            let i = reqInfo.mId.indexOf('/');
            if (i > -1) {
                if (reqInfo.mId.substring(0, i) === e.pkgName) {
                    let p = atpath.resolvePath('"@' + reqInfo.mId + '"', e.moduleId);
                    reqInfo.mId = p.slice(1, -1);
                }
            }
        }
        let dId = JSON.stringify(reqInfo.mId);
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
    }
};