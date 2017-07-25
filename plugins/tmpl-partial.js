/*
    子模板拆分
 */
let tmplCmd = require('./tmpl-cmd');
let slog = require('./util-log');
let regexp = require('./util-rcache');
let configs = require('./util-config');
let {
    getProps,
    getBooleanProps,
    maybeAttr
} = require('./tmpl-attr-map');
let holder = '\u001d';
//let slashAnchorReg = /\u0004/g;
//自闭合标签，需要开发者明确写上如 <input />，注意>前的/,不能是<img>
let selfCloseTag = /<([^>\s\/]+)\s+(mx-guid="g[^"]+")[^>]*?\/>/g;
let extractAttrsReg = /<[^>\s\/]+\s+mx-guid="[^"]+"\s+([^>]+?)\/?>/;
//属性正则
let attrNameValueReg = /([^=\/\s]+)(?:\s*=\s*(["'])[\s\S]*?\2)?(?=$|\s)/g;
//模板引擎命令被替换的占位符
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let globalTmplRootReg = /[\u0003\u0006]/g;
let virtualRoot = /<mxv-root[^>]+>([\s\S]+)<\/mxv-root>/g;
let escape$ = str => str.replace(/\$/g, '$&$&');
let escapeQ = str => str.replace(/"/g, '&#34;');
//恢复被替换的模板引擎命令
let commandAnchorRecover = (tmpl, refTmplCommands) => tmplCmd.recover(tmpl, refTmplCommands).replace(globalTmplRootReg, '$$$$');
let dataKeysReg = /\u0003\.([\w$]+)\.?/g;
let trimAttrsStart = /^[a-z\-\d]+(?:=(["'])[^\u0007]+?\1)?(?=\s+|\u0007\d+\u0007|$)/g;
let trimAttrsEnd = /(\s+|\u0007\d+\u0007)[a-z\-\d]+(?:=(["'])[^\u0007]+?\2)?$/;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let stringReg = /(['"])([a-z]+)\1/g;

//模板，子模板的处理，仍然是配合magix-updater：https://github.com/thx/magix-updater
//生成子模板匹配正则
let subReg = (() => {
    let temp = '<([^>\\s\\/]+)\\s+(mx-guid="g[^"]+")[^>]*?>(#)</\\1>';
    let start = 12; //嵌套12层在同一个view中也足够了
    while (start--) {
        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
    }
    temp = temp.replace('#', '[\\s\\S]*?');
    return regexp.get(temp, 'ig');
})();
let extractUpdateKeys = (tmpl, refTmplCommands, content, pKeys) => {
    let attrKeys = Object.create(null);
    let tmplKeys = Object.create(null);
    tmpl = tmpl.replace(content, ''); //标签加内容，移除内容，只剩标签
    //console.log('--------',tmpl,'======',content);
    while (subReg.test(content) || selfCloseTag.test(content)) { //清除子模板
        content = content.replace(selfCloseTag, '');
        content = content.replace(subReg, '');
        //break;
    }
    //console.log('=====', tmpl, '-----', content);
    tmpl.replace(tmplCommandAnchorReg, m => {
        let temp = refTmplCommands[m];
        //console.log(temp);
        temp.replace(dataKeysReg, (m, name) => { //数据key
            if (!pKeys || !pKeys[name]) { //不在父作用域内
                attrKeys[name] = 1;
            }
        });
    });
    content.replace(tmplCommandAnchorReg, m => { //查找模板命令
        let temp = refTmplCommands[m];
        temp.replace(dataKeysReg, (m, name) => { //数据key
            if (!pKeys || !pKeys[name]) { //不在父作用域内
                tmplKeys[name] = 1;
            }
        });
    });
    let allKeys = Object.assign(attrKeys, tmplKeys);
    return {
        keys: Object.keys(allKeys),
        attrKeys: attrKeys,
        tmplKeys: tmplKeys
    };
};
//添加属性信息
let addAttrs = (tag, tmpl, info, refTmplCommands, e) => {
    let attrsKeys = Object.create(null),
        tmplKeys = Object.create(null);
    tmpl.replace(extractAttrsReg, (match, attr) => {
        let originalAttr = attr;
        while (trimAttrsStart.test(attr)) {
            attr = attr.replace(trimAttrsStart, '').trim();
        }
        while (trimAttrsEnd.test(attr)) {
            attr = attr.replace(trimAttrsEnd, '$1').trim();
        }
        if (!attr) return;
        //console.log(attr);
        attr.replace(tmplCommandAnchorReg, match => {
            let value = refTmplCommands[match];
            value.replace(dataKeysReg, (m, vname) => {
                attrsKeys[vname] = 1;
            });
        });
        let hasProps = Object.create(null);
        originalAttr.replace(tmplCommandAnchorReg, '').replace(attrNameValueReg, (match, name) => {
            //console.log(name);
            hasProps[name] = 1;
        });
        let attrs = [];
        let attrsMap = Object.create(null);
        let type = '';
        if (tag == 'input') { //特殊处理input
            //console.log(originalAttr);
            let ms = originalAttr.match(inputTypeReg);
            if (ms) {
                type = ms[2];
            }
        }

        let props = [];
        let extractProps = attr.replace(tmplCommandAnchorReg, match => {
            let temp = commandAnchorRecover(match, refTmplCommands);
            temp.replace(stringReg, (match, q, content) => {
                if (!hasProps[content] && maybeAttr(content)) {
                    props.push(content);
                }
            });
            return '';
        });
        //let extractProps = attr.replace(tmplCommandAnchorReg, '');
        extractProps.replace(attrNameValueReg, (match, name) => {
            props.push(name);
        });
        for (let i = 0, prop; i < props.length; i++) {
            prop = props[i];
            if (attrsMap[prop] == 1) {
                if (configs.checker.tmplDuplicateAttr) {
                    slog.ever('duplicate attr:', prop.blue, ' near:', e.toTmplSrc(attr, refTmplCommands), ' relate file:', e.shortFrom.gray);
                }
                continue;
            }
            let t = Object.create(null);
            t.n = prop; // name
            attrsMap[prop] = 1;

            if (prop == 'mx-view') {
                t.v = 1; // mx-view
                info.hasView = true;
            }

            if ((tag == 'input' || tag == 'textarea') && prop == 'value') {
                t.q = 1; //decode html
            }

            let propInfo = getBooleanProps(tag, type);
            if (propInfo && propInfo[prop]) {
                t.b = 1; // boolean prop
            }
            propInfo = getProps(tag, type);
            if (propInfo) {
                let fixedName = propInfo[prop];
                if (fixedName) {
                    t.p = 1; // prop
                    if (fixedName != prop) {
                        t.f = fixedName;
                    }
                }
            }
            attrs.push(t);
        }
        attr = commandAnchorRecover(attr, refTmplCommands);
        if (attr) {
            info.attr = attr; //.replace(slashAnchorReg, '/');
            info.attrs = attrs;
        }
    });
    if (info.tmpl && info.attr) { //有模板及属性
        //接下来我们处理前面的属性和内容更新问题
        info.tmpl.replace(tmplCommandAnchorReg, match => {
            let value = refTmplCommands[match];
            value.replace(dataKeysReg, (m, vname) => {
                tmplKeys[vname] = 1;
            });
        });
        //console.log(info.keys, tmplKeys, attrsKeys);
        let mask = '';
        for (let i = 0, m; i < info.keys.length; i++) {
            m = 0;
            //如果key存在内容模板中，则m为1
            if (tmplKeys[info.keys[i]]) m = 1;
            //如果key存在属性中,则m为2或者或上1
            //console.log(info.keys);
            if (attrsKeys[info.keys[i]] || (m && info.hasView)) m = m ? m | 2 : 2;
            mask += m + '';
            if (m === 0) {
                slog.ever('check key word:', info.keys[i].red, ' relate file:', e.shortFrom.gray);
            }
        }
        //最后产出的结果可能如：
        /*
            {
                keys:['a','b','c'],
                mask:'211' //a对应2,b,c对应1，则表示a变化时，只更新属性,b,c变化时只更新节点内容
            }
         */
        if (/[12]/.test(mask))
            info.mask = mask;
    }
    delete info.hasView;
};

let g = 0;
//递归构建子模板
let buildTmpl = (tmpl, refTmplCommands, e, list, parentOwnKeys, globalKeys) => {
    if (!list) {
        list = [];
        g = 0;
        globalKeys = Object.create(null);
    }
    let subs = [];
    let removeGuids = []; //经过tmpl-guid插件之后，所有的标签都会加上guid，但只有具备局部刷新的标签才保留guid，其它的移除，这里用来记录要移除的guid
    //子模板
    //console.log('input ',tmpl);
    //debugger;
    tmpl = tmpl.replace(subReg, (match, tag, guid, content) => { //清除子模板后
        //match = match.replace(slashAnchorReg, '/');
        //console.log('match',match,tag,guid,'=======',content);
        //debugger;
        let ownKeys = Object.create(null);
        for (let p in parentOwnKeys) { //继承父结构的keys
            ownKeys[p] = parentOwnKeys[p];
        }
        let selector = tag + '[' + guid + ']';
        if (tag == 'mxv-root') {
            selector = '#\u001f';
        }
        let tmplInfo = {
            s: ++g + holder,
            keys: [],
            tmpl: content,
            path: selector
        };
        if (parentOwnKeys) {
            let pKeys = Object.keys(parentOwnKeys);
            if (pKeys.length) {
                tmplInfo.pKeys = pKeys; //记录父结构有哪些keys，当数据变化且在父结构中时，当前结构是不需要去做更新操作的，由父代劳
            }
        }
        //let datakey = refGuidToKeys[guid];
        //let keys = datakey.split(',');
        let remain = match;
        let kInfo = extractUpdateKeys(match, refTmplCommands, content, parentOwnKeys); //从当前匹配到的标签取对应的数据key
        //console.log(kInfo);
        //console.log('keys', kInfo, match, content);
        if (kInfo.keys.length) { //从当前标签分析出了数据key后，再深入分析
            for (let i = 0, key; i < kInfo.keys.length; i++) {
                key = kInfo.keys[i].trim();
                tmplInfo.keys.push(key);
                globalKeys[key] = 1;
            }
            ownKeys = kInfo.tmplKeys;
            //list.push(tmplInfo); //先记录
            if (tag == 'textarea') { //textarea特殊处理，因为textarea可以有节点内容
                remain = match;
                let addValueAsAttr = remain;
                if (tmplCommandAnchorRegTest.test(content)) {
                    let idx = addValueAsAttr.indexOf('>');
                    addValueAsAttr = addValueAsAttr.slice(0, idx) + ' value="' + escapeQ(content) + '"' + addValueAsAttr.slice(idx);
                }
                addAttrs(tag, addValueAsAttr, tmplInfo, refTmplCommands, e);
                delete tmplInfo.s; //这3行删除不必要的属性，节省资源
                delete tmplInfo.tmpl;
                delete tmplInfo.mask;
                list.push(tmplInfo);
            } else {
                //从内容中移除自闭合标签及子模板
                let tContent = content.replace(selfCloseTag, '').replace(subReg, '');
                let wrapTag;
                if (tmplCommandAnchorRegTest.test(tContent)) { //如果剩余有模板命令
                    //则使用占位符的方式占位
                    wrapTag = remain = match.replace('>' + content + '<', '>' + g + holder + '<'); //只留包括的标签及占位符
                    //然后再递归分析子模板
                    subs.push({
                        tmpl: content,
                        ownKeys: ownKeys,
                        tmplInfo: tmplInfo
                    });
                } else {
                    //console.log('here', match, content)
                    //移除后如果没有模板命令，则当前标签最好只有属性里有局部更新
                    //仍然需要递归子模板
                    //subs.push({
                    //  tmpl: content
                    //});
                    //remain = match; //去除子模板后没有模板命令，则保留所有内容
                    wrapTag = match.replace('>' + content, '>'); //属性分析时要去除干扰的内容
                    if (tmplCommandAnchorRegTest.test(content)) {
                        let info = buildTmpl(content, refTmplCommands, e, list, ownKeys, globalKeys);
                        //console.log(match, '----', content, 'xxx', info.tmpl);
                        remain = match.replace('>' + content, '>' + escape$(info.tmpl));
                    } else {
                        remain = match;
                    }
                    delete tmplInfo.tmpl; //删除模板
                    delete tmplInfo.s; //删除占位
                }
                //console.log('wrapTag', wrapTag);
                //对当前标签分析属性的局部更新
                addAttrs(tag, wrapTag, tmplInfo, refTmplCommands, e);
                if (!tmplInfo.attr) {
                    delete tmplInfo.attr;
                }
                if (!tmplInfo.attr && !tmplInfo.tmpl) { //如果没有属性更新，则删除，减少资源占用
                    delete tmplInfo.attr;
                    removeGuids.push(guid);
                } else {
                    list.push(tmplInfo);
                }
            }
        } else { //如果当前标签分析不到数据key，则是不需要局部刷新的节点
            removeGuids.push(guid);
        }
        if (virtualRoot.test(remain)) {
            remain = remain.replace(virtualRoot, '$1');
        }
        return remain;
    });
    //自闭合
    tmpl.replace(selfCloseTag, (match, tag, guid) => {
        //match = match.replace(/\u0004/g, '/');
        let tmplInfo = {
            keys: [],
            path: tag + '[' + guid + ']'
        };
        if (parentOwnKeys) {
            let pKeys = Object.keys(parentOwnKeys);
            if (pKeys.length) {
                tmplInfo.pKeys = pKeys; //记录父结构有哪些keys，当数据变化且在父结构中时，当前结构是不需要去做更新操作的，由父代劳
            }
        }
        //自闭合标签只需要分析属性即可
        let kInfo = extractUpdateKeys(match, refTmplCommands, '', parentOwnKeys);
        if (kInfo.keys.length) { //同样，当包含数据更新的key时才进行深入分析
            for (let i = 0, key; i < kInfo.keys.length; i++) {
                key = kInfo.keys[i].trim();
                tmplInfo.keys.push(key);
            }
            list.push(tmplInfo);
            //属性分析
            addAttrs(tag, match, tmplInfo, refTmplCommands, e);
        } else { //记录移除的guid
            removeGuids.push(guid);
        }
    });
    while (subs.length) { //开始递归调用
        let sub = subs.shift();
        let i = buildTmpl(sub.tmpl, refTmplCommands, e, list, sub.ownKeys, globalKeys);
        //if (sub.tmplInfo) {
        sub.tmplInfo.tmpl = i.tmpl;
        //}
    }
    tmpl = commandAnchorRecover(tmpl, refTmplCommands); //恢复模板命令
    for (let i = removeGuids.length; i >= 0; i--) { //删除没用的guid
        tmpl = tmpl.replace(' ' + removeGuids[i], '');
    }
    //tmpl = tmpl.replace(slashAnchorReg, '/');
    return {
        list: list,
        tmpl: tmpl,
        keys: globalKeys
    };
};
module.exports = {
    process: buildTmpl
};