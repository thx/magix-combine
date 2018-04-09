/*
    分析模板中不变的html片断，加速虚拟dom的diff
    程序可自动识别哪些节点不会变化
    开发者也可通过在节点上添加<div mx-static>强制指定该节点下所有的节点不会变化　

    mxs的使用场景：整个节点(包括属性)及子节点内不包含任何变量
    mxa的使用场景：节点的属性不包含任何变量
    mxv的使用场景：

    <div>
        <div mx-view="path/to/view?a={{@a}}"></div>
    </div>

    对于这段代码，因为a是使用`@a`的引用方式，即使a发生了改变，这段代码有可能不会变化


*/
let md5 = require('./util-md5');
let tmplParser = require('./tmpl-parser');
let configs = require('./util-config');
let tagReg = /<([^>\s\/]+)([^>]*?)(\/)?>/g;
let staticKeyReg = /\s*_mxs="[^"]+"/g;
let attrKeyReg = /\s*_mxa="[^"]+"/g;
let mxvKeyReg = /\s*_mxv="[^"]+"/g;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let forceStaticKey = /\s+mx-static(?:\s*=\s*(['"])[^'"]+\1)?/;
let slotKeyReg = /\s*_mxslot="[^"]+"/g;

module.exports = (tmpl, file) => {
    let g = 0;
    let prefix = configs.projectName + md5(file, 'tmplFiles', '', true) + ':';
    tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
        tKey = ' _mxv="' + g++ + '"';
        tKey += ' _mxs="' + g++ + '"';
        tKey += ' _mxa="' + g++ + '"';
        tKey += ' _mxslot="' + g++ + '"';
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
                let html = tmpl.substring(n.start, n.end).replace(staticKeyReg, '').replace(attrKeyReg, '').replace(mxvKeyReg, '');
                let attr = tmpl.substring(n.attrsStart, n.attrsEnd).trim();
                attr = attr.replace(staticKeyReg, '').replace(attrKeyReg, '').replace(mxvKeyReg, '').trim();
                let removeStaticKey = false;
                keysMap[' _mxs="' + n.mxsKey + '"'] = html;
                keysMap[' _mxa="' + n.mxsAttrKey + '"'] = attr;
                if (attr) {
                    if (tmplCommandAnchorRegTest.test(attr)) {
                        keys.push(' _mxa="' + n.mxsAttrKey + '"');
                    }
                } else {
                    keys.push(' _mxa="' + n.mxsAttrKey + '"');
                }
                if (n.mxvKey) {
                    keys.push(' _mxv="' + n.mxvAutoKey + '"');
                } else if (n.children) {
                    let hasSubView = 0;
                    for (let c of n.children) {
                        /*
                            对于input textarea等，我们也利用mxv属性深入diff
                            场景：<input value="{{=abc}}"/>
                            updater.digest({abc:'abc'});
                            然后用户删除了input中的abc修改成了123
                            此时依然updater.digest({abc:'abc'}),问input中的值该显示abc还是123?
                            该方案目的是显示abc
                        */
                        if (c.mxvKey ||
                            c.mxvAutoKey ||
                            c.tag == 'input' ||
                            c.tag == 'textarea' ||
                            c.tag == 'option') {
                            hasSubView = 1;
                            break;
                        }
                    }
                    if (!hasSubView) {
                        keys.push(' _mxv="' + n.mxvAutoKey + '"');
                        delete n.mxvAutoKey;
                    }
                } else {
                    keys.push(' _mxv="' + n.mxvAutoKey + '"');
                    delete n.mxvAutoKey;
                }
                if (tmplCommandAnchorRegTest.test(html)) {
                    if (n.userStaticKey) {
                        userKeysMap[' _mxs="' + n.mxsKey + '"'] = n.userStaticKey;
                        if (n.children && n.userStaticKey !== 'false') {
                            removeChildrenStaicKeys(n.children, keys);
                        }
                    } else {
                        removeStaticKey = true;
                        keys.push(' _mxs="' + n.mxsKey + '"');
                    }
                } else if (n.children) {
                    let hasMxv = false;
                    for (let c of n.children) {
                        if (c.mxvKey ||
                            c.mxvAutoKey ||
                            c.tag == 'input' ||
                            c.tag == 'textarea' ||
                            c.tag == 'option') {
                            hasMxv = true;
                            removeStaticKey = true;
                            keys.push(' _mxs="' + n.mxsKey + '"');
                            break;
                        }
                    }
                    if (!hasMxv) {
                        removeChildrenStaicKeys(n.children, keys);
                    }
                }
                if (!removeStaticKey) {
                    keys.push(' _mxa="' + n.mxsAttrKey + '"');
                }
            }
        };
        walk(tokens);

        let slot = (nodes, named) => {
            for (let n of nodes) {
                if (n.hasMxView) {
                    if (!named && !n.namedSlot) {
                        keys.push(' _mxslot="' + n.mxSlotKey + '"');
                    }
                } else {
                    keys.push(' _mxslot="' + n.mxSlotKey + '"');
                }
                if (n.hasContent) {
                    if (n.children) {
                        slot(n.children, named || n.namedSlot);
                    }
                }
            }
        };
        slot(tokens);
        return keys;
    };
    let keys = getRemovedStaticKeys();
    for (let key of keys) {
        tmpl = tmpl.replace(key, '');
    }
    tmpl = tmpl.replace(tagReg, m => {
        return m.replace(staticKeyReg, m => {
            let r = userKeysMap[m];
            if (r === 'false') return '';
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
        }).replace(slotKeyReg, () => {
            return ' mx-slot="\x1f"';
        }).replace(mxvKeyReg, ' mxv')
            .replace(forceStaticKey, '');
    });
    return tmpl;
};