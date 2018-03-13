/*
    分析模板中不变的html片断，加速虚拟dom的diff
    程序可自动识别哪些节点不会变化
    开发者也可通过在节点上添加<div mx-static>强制指定该节点下所有的节点不会变化　
*/
let md5 = require('./util-md5');
let tmplParser = require('./tmpl-parser');
let configs = require('./util-config');
let tagReg = /<([^>\s\/]+)([^>]*?)(\/)?>/g;
let staticKeyReg = /\s*_mxs="[^"]+"/g;
let attrKeyReg = /\s*_mxa="[^"]+"/g;
let mxvKeyReg = /\s*_mxv="[^"]+"/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let forceStaticKey = /\s+mx-static(?:\s*=\s*(['"])[^'"]+\1)?/;
let hasVariable = (part, refTmplCommands) => {
    let exist = false;
    part.replace(tmplCommandAnchorReg, m => {
        let temp = refTmplCommands[m];
        if (temp.indexOf('\x01') > -1 || temp.indexOf('\x03.') > -1) {
            exist = true;
        }
    });
    return exist;
};
module.exports = (tmpl, file, refTmplCommands) => {
    let g = 0;
    let prefix = configs.projectName + md5(file, 'tmplFiles', '', true) + ':';
    tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
        tKey = ' _mxv="' + g++ + '"';
        tKey += ' _mxs="' + g++ + '"';
        tKey += ' _mxa="' + g++ + '"';
        return '<' + tag + tKey + attrs + (close || '') + '>';
    });
    let tokens = tmplParser(tmpl);
    let keysMap = Object.create(null),
        userKeysMap = Object.create(null);

    let removeChildrenStaicKeys = (children, keys) => {
        for (let c of children) {
            if (c.children) removeChildrenStaicKeys(c.children, keys);
            let key = ' _mxs="' + c.mxsKey + '"';
            if (keys.indexOf(key) == -1) {
                keys.push(key);
            }
            key = ' _mxa="' + c.mxsAttrKey + '"';
            if (keys.indexOf(key) == -1) {
                keys.push(key);
            }
        }
    };
    let getRemovedStaticKeys = () => {
        let keys = [];
        let walk = nodes => {
            for (let n of nodes) {
                if (n.hasContent) {
                    if (n.children) {
                        walk(n.children);
                    }
                }
                let t = tmpl.slice(n.start, n.end).replace(staticKeyReg, '').replace(attrKeyReg, '');
                let attr = tmpl.slice(n.attrsStart, n.attrsEnd).trim();
                attr = attr.replace(staticKeyReg, '').replace(attrKeyReg, '').replace(mxvKeyReg, '').trim();
                let removeStaticKey = false;
                keysMap[' _mxs="' + n.mxsKey + '"'] = t;
                keysMap[' _mxa="' + n.mxsAttrKey + '"'] = attr;
                if (attr) {
                    if (hasVariable(attr, refTmplCommands)) {
                        keys.push(' _mxa="' + n.mxsAttrKey + '"');
                    }
                } else {
                    keys.push(' _mxa="' + n.mxsAttrKey + '"');
                }
                let checkView = 0;
                if (n.hasMxView) {
                    let query = n.mxView.split('?');
                    if (query.length > 1) {
                        checkView = !tmplCommandAnchorRegTest.test(query[1]);
                    } else {
                        checkView = 1;
                    }
                } else {
                    checkView = 1;
                }
                if (checkView) {
                    let hasSubView = 0;
                    if (n.children) {
                        for (let c of n.children) {
                            if (c.mxvKey) {
                                hasSubView = 1;
                                break;
                            }
                        }
                    }
                    if (!hasSubView) {
                        keys.push(' _mxv="' + n.mxvKey + '"');
                        delete n.mxvKey;
                    }
                }
                if (hasVariable(t, refTmplCommands)) {
                    if (n.userStaticKey) {
                        userKeysMap[' _mxs="' + n.mxsKey + '"'] = n.userStaticKey;
                        if (n.children) {
                            removeChildrenStaicKeys(n.children, keys);
                        }
                    } else {
                        removeStaticKey = true;
                        keys.push(' _mxs="' + n.mxsKey + '"');
                    }
                } else if (n.children) {
                    removeChildrenStaicKeys(n.children, keys);
                }
                if (!removeStaticKey) {
                    keys.push(' _mxa="' + n.mxsAttrKey + '"');
                }
            }
        };
        walk(tokens);
        return keys;
    };
    let keys = getRemovedStaticKeys();
    for (let key of keys) {
        tmpl = tmpl.replace(key, '');
    }
    tmpl = tmpl.replace(staticKeyReg, m => {
        let r = userKeysMap[m];
        if (!r || r === true) {
            r = keysMap[m];
            r = md5(r, file + ':key', prefix, true);
        } else {
            r = md5(m, file + ':key', prefix, true) + ':' + r;
        }
        return ' mxs="' + r + '"';
    }).replace(attrKeyReg, m => {
        m = keysMap[m];
        return ' mxa="' + md5(m, file + ':akey', prefix, true) + '"';
    }).replace(mxvKeyReg, ' mxv').replace(tagReg, m => m.replace(forceStaticKey, ''));
    return tmpl;
};