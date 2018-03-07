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
let attrKeyReg = /\s+_mxa="[^"]+"/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
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
        tKey = ' _mxs="' + g++ + '"';
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
                attr = attr.replace(staticKeyReg, '').replace(attrKeyReg, '').trim();
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
            r = md5(r, file + ':key', '', true);
        } else {
            r = md5(m, file + ':key', '', true) + ':' + r;
        }
        return ' mxs="' + prefix + r + '"';
    }).replace(attrKeyReg, m => {
        m = keysMap[m];
        return ' mxa="' + prefix + md5(m, file + ':akey', '', true) + '"';
    }).replace(tagReg, m => m.replace(forceStaticKey, ''));
    return tmpl;
};