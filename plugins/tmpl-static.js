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
let mxViewOwnerReg = /\s*_mxo="[^"]+"/g;
let mxDiffReg = /\s*mx-diff(?:\s*=\s*(['"])[^'"]+\1)?/;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let forceStaticKey = /\s+mx-static(?:-attr)?(?:\s*=\s*(['"])[^'"]+\1)?/;
let ifForReg = /\s*(?:if|for|for_declare)\s*=\s*"[^"]+"/g;

module.exports = (tmpl, file) => {
    let g = 0;
    let prefix = configs.projectName + md5(file, 'tmplFiles', '', true) + ':';
    tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
        tKey = ' _mxv="' + g++ + '"';
        tKey += ' _mxs="' + g++ + '"';
        tKey += ' _mxa="' + g++ + '"';
        if (configs.magixVframeHost) {
            tKey += ' _mxo="' + g++ + '"';
        }
        return '<' + tag + tKey + attrs + (close || '') + '>';
    });
    let tokens = tmplParser(tmpl, file);
    let keysMap = Object.create(null),
        userKeysMap = Object.create(null),
        userAttrKeysMap = Object.create(null);
    let removeChildrenStaticKeys = (children, keys) => {
        for (let c of children) {
            if (c.children) removeChildrenStaticKeys(c.children, keys);
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
                if (!n.hasMxView && n.mxViewOwner) {
                    keys.push(' _mxo="' + n.mxViewOwner + '"');
                }
                let html = tmpl.substring(n.start, n.end)
                    .replace(staticKeyReg, '')
                    .replace(attrKeyReg, '')
                    .replace(mxvKeyReg, '')
                    .replace(mxViewOwnerReg, '');
                if (configs.magixUpdaterQuick) {
                    html = html.replace(ifForReg, '');
                }
                let attr = tmpl.substring(n.attrsStart, n.attrsEnd);
                attr = attr.replace(staticKeyReg, '')
                    .replace(attrKeyReg, '')
                    .replace(mxvKeyReg, '').trim();
                if (configs.magixUpdaterQuick) {
                    attr = attr.replace(ifForReg, '').trim();
                }
                let removeStaticKey = false;
                keysMap[' _mxs="' + n.mxsKey + '"'] = html;
                keysMap[' _mxa="' + n.mxsAttrKey + '"'] = attr;
                if (attr) {
                    if (tmplCommandAnchorRegTest.test(attr)) {
                        if (n.userStaticAttrKey) {
                            userAttrKeysMap[' _mxa="' + n.mxsAttrKey + '"'] = n.userStaticAttrKey;
                        } else {
                            keys.push(' _mxa="' + n.mxsAttrKey + '"');
                        }
                    }
                } else {
                    keys.push(' _mxa="' + n.mxsAttrKey + '"');
                }


                //清理mxv
                //先清理
                //quick模板不用处理，在magix/quick.js中已自动处理了mxv
                if (configs.magixUpdaterQuick) {
                    keys.push(' _mxv="' + n.mxvAutoKey + '"');
                    delete n.mxvAutoKey;
                } else {
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
                                c.forceDiff ||
                                c.tag == 'input' ||
                                c.tag == 'direct' ||
                                c.tag == 'textarea' ||
                                c.tag == 'option') {
                                // if (c.mxvKey && c.namedSlot) {
                                //     continue;
                                // }
                                hasSubView = 1;
                                break;
                            }
                        }
                        if (!hasSubView && !n.forceDiff) {
                            keys.push(' _mxv="' + n.mxvAutoKey + '"');
                            delete n.mxvAutoKey;
                        }
                    } else if (!n.forceDiff) {
                        keys.push(' _mxv="' + n.mxvAutoKey + '"');
                        delete n.mxvAutoKey;
                    }
                }

                if (tmplCommandAnchorRegTest.test(html)) {
                    if (n.userStaticKey) {
                        userKeysMap[' _mxs="' + n.mxsKey + '"'] = n.userStaticKey;
                        if (n.children && n.userStaticKey !== 'false') {
                            removeChildrenStaticKeys(n.children, keys);
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
                            c.forceDiff ||
                            c.tag == 'group' ||
                            c.tag == 'input' ||
                            c.tag == 'textarea' ||
                            c.tag == 'option') {
                            hasMxv = true;
                            removeStaticKey = true;
                            keys.push(' _mxs="' + n.mxsKey + '"');
                            break;
                        }
                    }
                    if (!hasMxv && !n.hasMxIs && !n.forceDiff) {
                        removeChildrenStaticKeys(n.children, keys);
                    }
                }
                if (!removeStaticKey) {
                    if (n.hasMxIs || n.forceDiff) {
                        keys.push(' _mxs="' + n.mxsKey + '"');
                    }
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
            let r = userAttrKeysMap[m];
            if (r === 'false') return '';
            if (!r || r === true) {
                r = keysMap[m];
                r = md5(m, file + ':akey', prefix, true);
            } else {
                r = md5(m, file + ':akey', prefix, true) + ':' + r;
            }
            return ' mxa="' + r + '"';
        }).replace(mxvKeyReg, ' mxv')
            .replace(forceStaticKey, '')
            .replace(mxDiffReg, '')
            .replace(mxViewOwnerReg, ' mxo="\x1f"');
    });
    return tmpl;
};