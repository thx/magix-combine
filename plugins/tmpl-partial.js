var tmplCmd = require('./tmpl-cmd');
var tmplClass = require('./tmpl-class');
//模板，子模板的处理，仍然是配合magix-updater：https://github.com/thx/magix-updater
//生成子模板匹配正则
var subReg = (function() {
    var temp = '<([\\w]+)\\s+(mx-guid="g[^"]+")[^>\\/]*?>(#)</\\1>';
    var start = 12; //嵌套12层在同一个view中也足够了
    while (start--) {
        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
    }
    temp = temp.replace('#', '[\\s\\S]*?');
    return new RegExp(temp, 'ig');
}());
var holder = '\u001f';
var slashAnchorReg = /\u0004/g;
//自闭合标签，需要开发者明确写上如 <input />，注意>前的/,不能是<img>
var selfCloseTag = /<(\w+)\s+(mx-guid="g[^"]+")[^>]*?\/>/g;
var extractAttrsReg = /<\w+\s+mx-guid="[^"]+"\s+([^>]+?)\/?>/;
//属性正则
var attrNameValueReg = /([a-z\-\d]+)(?:=(["'])[\s\S]*?\2)?(?=$|\s)/g;
//模板引擎命令被替换的占位符
var tmplCommandAnchorReg = /\u001e\d+\u001e/g;
var tmplCommandAnchorRegTest = /\u001e\d+\u001e/;
var globalTmplRootReg = /\u0003/g;
//恢复被替换的模板引擎命令
var commandAnchorRecover = function(tmpl, refTmplCommands) {
    return tmplCmd.recover(tmpl, refTmplCommands).replace(globalTmplRootReg, '$');
};
var dataKeysReg = /\u0003\.(\w+)\.?/g;
var extractUpdateKeys = function(tmpl, refTmplCommands, content, pKeys) {
    var keys = {};
    tmpl = tmpl.replace(content, ''); //标签加内容，移除内容，只剩标签
    while (subReg.test(content) || selfCloseTag.test(content)) { //清除子模板
        content = content.replace(selfCloseTag, '');
        content = content.replace(subReg, '');
        //break;
    }
    (tmpl + content).replace(tmplCommandAnchorReg, function(m) { //查找模板命令
        var temp = refTmplCommands[m];
        temp.replace(dataKeysReg, function(m, name) { //数据key
            if (!pKeys || !pKeys[name]) { //不在父作用域内
                keys[name] = 1;
            }
        });
    });
    return Object.keys(keys);
};
var escapeQ = function(str) {
    return str.replace(/"/g, '&quote;');
};
var tagsBooleanPrpos = {
    input: {
        disabled: 1,
        readonly: 1,
        required: 1,
        multiple: 1
    },
    'input&checkbox': {
        disabled: 1,
        checked: 1
    },
    'input&radio': {
        disabled: 1,
        checked: 1
    },
    'input&number': {
        disabled: 1,
        readonly: 1
    },
    'input&range': {
        disabled: 1,
        readonly: 1
    },
    textarea: {
        disabled: 1,
        readonly: 1,
        required: 1,
        spellcheck: 1
    },
    select: {
        disabled: 1,
        multiple: 1,
        required: 1
    },
    audio: {
        autoplay: 1,
        controls: 1,
        loop: 1,
        muted: 1
    },
    video: {
        autoplay: 1,
        controls: 1,
        loop: 1,
        muted: 1
    },
    button: {
        disabled: 1
    }
};
var tagsProps = {
    input: {
        maxlength: 'maxLength',
        minlength: 'minLength',
        disabled: 'disabled',
        readonly: 'readOnly',
        value: 'value',
        placeholder: 'placeholder',
        required: 'required',
        size: 'size',
        pattern: 'pattern',
        multiple: 'multiple',
        autocomplete: 'autocomplete'
    },
    'input&checkbox': {
        disabled: 'disabled',
        checked: 'checked',
        value: 'value'
    },
    'input&radio': {
        disabled: 'disabled',
        checked: 'checked',
        value: 'value'
    },
    'input&number': {
        disabled: 'disabled',
        readonly: 'readOnly',
        value: 'value',
        placeholder: 'placeholder',
        size: 'size',
        max: 'max',
        min: 'min',
        step: 'step'
    },
    'input&range': {
        disabled: 'disabled',
        readonly: 'readOnly',
        value: 'value',
        max: 'max',
        min: 'min',
        step: 'step'
    },
    'input&file': {
        accept: 'accept'
    },
    textarea: {
        cols: 'cols',
        rows: 'rows',
        value: 'value',
        placeholder: 'placeholder',
        readonly: 'readOnly',
        required: 'required',
        maxlength: 'maxLength',
        minlength: 'minLength',
        spellcheck: 'spellcheck'
    },
    select: {
        disabled: 'disabled',
        multiple: 'multiple',
        size: 'size',
        required: 'required'
    },
    form: {
        action: 'action',
        target: 'target',
        method: 'method',
        enctype: 'enctype'
    },
    iframe: {
        src: 'src',
        scrolling: 'scrolling'
    },
    a: {
        href: 'href',
        charset: 'charset',
        hreflang: 'hreflang',
        name: 'name',
        rel: 'rel',
        rev: 'rev',
        target: 'target'
    },
    th: {
        colspan: 'colSpan',
        rowspan: 'rowSpan'
    },
    td: {
        colspan: 'colSpan',
        rowspan: 'rowSpan'
    },
    img: {
        src: 'src',
        alt: 'alt',
        width: 'width',
        height: 'height'
    },
    audio: {
        autoplay: 'autoplay',
        controls: 'controls',
        src: 'src',
        loop: 'loop',
        muted: 'muted',
        volume: 'volume'
    },
    video: {
        autoplay: 'autoplay',
        controls: 'controls',
        src: 'src',
        loop: 'loop',
        muted: 'muted',
        volume: 'volume',
        width: 'width',
        height: 'height'
    },
    button: {
        disabled: 'disabled',
        value: 'value'
    },
    canvas: {
        width: 'width',
        height: 'height'
    }
};
var globalProps = {
    id: 'id',
    class: 'className',
    title: 'title',
    dir: 'dir',
    accesskey: 'accessKey',
    //contenteditable: 'contentEditable',//这个比较特殊
    tabindex: 'tabIndex'
};
var trimAttrsStart = /^[a-z\-\d]+(?:=(["'])[^\u001e]+?\1)?(?=\s+|\u001e\d+\u001e|$)/g;
var trimAttrsEnd = /(\s+|\u001e\d+\u001e)[a-z\-\d]+(?:=(["'])[^\u001e]+?\2)?$/;
var inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
//添加属性信息
var addAttrs = function(tag, tmpl, info, refTmplCommands, cssNamesMap) {
    var attrsKeys = {},
        tmplKeys = {};
    tmpl = tmplClass.process(tmpl, cssNamesMap);
    tmpl.replace(extractAttrsReg, function(match, attr) {
        var originAttr = attr;
        while (trimAttrsStart.test(attr)) {
            attr = attr.replace(trimAttrsStart, '').trim();
        }
        while (trimAttrsEnd.test(attr)) {
            attr = attr.replace(trimAttrsEnd, '$1').trim();
        }
        if (!attr) return;
        //console.log(attr);
        attr.replace(tmplCommandAnchorReg, function(match) {
            var value = refTmplCommands[match];
            value.replace(dataKeysReg, function(m, vname) {
                attrsKeys[vname] = 1;
            });
        });
        var attrs = [];
        var attrsMap = {};
        var type = '';
        if (tag == 'input') { //特殊处理input
            //console.log(originAttr);
            var ms = originAttr.match(inputTypeReg);
            if (ms) {
                type = ms[2];
            }
        }
        var extractProps = attr.replace(tmplCommandAnchorReg, '');
        var props = [];
        extractProps.replace(attrNameValueReg, function(match, name) {
            props.push(name);
        });
        //console.log(extractProps);
        for (var i = 0, prop, curIndex = 0; i < props.length; i++) {
            prop = props[i];
            var fixedProp = prop;
            if (attrsMap[prop] == 1) {
                console.warn('duplicate attr:', prop, ' near:', commandAnchorRecover(attr, refTmplCommands));
                curIndex = attr.indexOf(prop, curIndex) + prop.length;
                continue;
            }
            var t = {};
            t.n = prop;
            attrsMap[prop] = 1;

            if (prop == 'mx-view') {
                t.v = 1;
            }

            var propInfo = tagsBooleanPrpos[tag + '&' + type] || tagsBooleanPrpos[tag];
            if (propInfo && propInfo[prop]) {
                t.b = 1;
            }
            propInfo = tagsProps[tag + '&' + type] || tagsProps[tag];
            var searchGlobal = false;
            if (propInfo) {
                var fixedName = propInfo[prop];
                if (fixedName) {
                    t.p = 1;
                    t.n = fixedName;
                    fixedProp = fixedName;
                } else {
                    searchGlobal = true;
                }
            } else {
                searchGlobal = true;
            }
            if (searchGlobal) {
                propInfo = globalProps[prop];
                if (propInfo) {
                    t.p = 1;
                    t.n = propInfo;
                    fixedProp = propInfo;
                }
            }
            attrs.push(t);
            curIndex = attr.indexOf(prop, curIndex);
            //console.log(curIndex, prop, attr);
            attr = attr.slice(0, curIndex) + fixedProp + attr.slice(curIndex + prop.length);
            curIndex += prop.length;
        }
        attr = commandAnchorRecover(attr, refTmplCommands);
        if (attr) {
            info.attr = attr;
            info.attrs = attrs;
        }
    });
    if (info.tmpl && info.attr) { //有模板及属性
        //接下来我们处理前面的属性和内容更新问题
        info.tmpl.replace(tmplCommandAnchorReg, function(match) {
            var value = refTmplCommands[match];
            value.replace(dataKeysReg, function(m, vname) {
                tmplKeys[vname] = 1;
            });
        });
        //console.log(info.keys, tmplKeys, attrsKeys);
        var mask = '';
        for (var i = 0, m; i < info.keys.length; i++) {
            m = 0;
            //如果key存在内容模板中，则m为1
            if (tmplKeys[info.keys[i]]) m = 1;
            //如果key存在属性中,则m为2或者或上1
            if (attrsKeys[info.keys[i]]) m = m ? m | 2 : 2;
            mask += m + '';
            if (m === 0) {
                console.error('check key word:', info.keys[i]);
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
};

var g = 0;
//递归构建子模板
var buildTmpl = function(tmpl, refTmplCommands, cssNamesMap, list, parentOwnKeys, globalKeys) {
    if (!list) {
        list = [];
        g = 0;
        globalKeys = {};
    }
    var subs = [];
    var removeGuids = []; //经过tmpl-guid插件之后，所有的标签都会加上guid，但只有具备局部刷新的标签才保留guid，其它的移除，这里用来记录要移除的guid
    //子模板
    //console.log('input ',tmpl);
    tmpl = tmpl.replace(subReg, function(match, tag, guid, content) { //清除子模板后
        match = match.replace(slashAnchorReg, '/');
        //console.log(match,tag,guid,content);
        var ownKeys = {};
        for (var p in parentOwnKeys) { //继承父结构的keys
            ownKeys[p] = parentOwnKeys[p];
        }
        //console.log('gggggg', match,'cccc',content);
        var tmplInfo = {
            s: ++g,
            keys: [],
            tmpl: content,
            path: tag + '[' + guid + ']'
        };
        if (parentOwnKeys) {
            var pKeys = Object.keys(parentOwnKeys);
            if (pKeys.length) {
                tmplInfo.pKeys = pKeys; //记录父结构有哪些keys，当数据变化且在父结构中时，当前结构是不需要去做更新操作的，由父代劳
            }
        }
        //var datakey = refGuidToKeys[guid];
        //var keys = datakey.split(',');
        var remain = match;
        var keys = extractUpdateKeys(match, refTmplCommands, content, parentOwnKeys); //从当前匹配到的标签取对应的数据key
        //console.log('keys',keys,match,content);
        if (keys.length) { //从当前标签分析出了数据key后，再深入分析
            for (var i = 0, key; i < keys.length; i++) {
                key = keys[i].trim();
                tmplInfo.keys.push(key);
                ownKeys[key] = 1;
                globalKeys[key] = 1;
            }
            //list.push(tmplInfo); //先记录
            if (tag == 'textarea') { //textarea特殊处理，因为textarea可以有节点内容
                remain = match;
                var addValueAsAttr = remain;
                if (tmplCommandAnchorRegTest.test(content)) {
                    var idx = addValueAsAttr.indexOf('>');
                    addValueAsAttr = addValueAsAttr.slice(0, idx) + ' value="' + escapeQ(content) + '"' + addValueAsAttr.slice(idx);
                }
                addAttrs(tag, addValueAsAttr, tmplInfo, refTmplCommands, cssNamesMap);
                delete tmplInfo.s; //这3行删除不必要的属性，节省资源
                delete tmplInfo.tmpl;
                delete tmplInfo.mask;
                list.push(tmplInfo);
            } else {
                //从内容中移除自闭合标签及子模板
                var tContent = content.replace(selfCloseTag, '').replace(subReg, '');
                var wrapTag;
                if (tmplCommandAnchorRegTest.test(tContent)) { //如果剩余有模板命令
                    //则使用占位符的方式占位
                    wrapTag = remain = match.replace('>' + content, '>' + holder + g + holder); //只留包括的标签及占位符
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
                        var info = buildTmpl(content, refTmplCommands, cssNamesMap, list, ownKeys, globalKeys);
                        //console.log(match, '----', content, 'xxx', info.tmpl);
                        remain = match.replace('>' + content, '>' + info.tmpl);
                    } else {
                        remain = match;
                    }
                    delete tmplInfo.tmpl; //删除模板
                    delete tmplInfo.s; //删除占位
                }
                //console.log('wrapTag', wrapTag);
                //对当前标签分析属性的局部更新
                addAttrs(tag, wrapTag, tmplInfo, refTmplCommands, cssNamesMap);
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
        return remain;
    });
    //自闭合
    tmpl.replace(selfCloseTag, function(match, tag, guid) {
        //match = match.replace(/\u0004/g, '/');
        var tmplInfo = {
            keys: [],
            path: tag + '[' + guid + ']'
        };
        if (parentOwnKeys) {
            var pKeys = Object.keys(parentOwnKeys);
            if (pKeys.length) {
                tmplInfo.pKeys = pKeys; //记录父结构有哪些keys，当数据变化且在父结构中时，当前结构是不需要去做更新操作的，由父代劳
            }
        }
        //自闭合标签只需要分析属性即可
        var keys = extractUpdateKeys(match, refTmplCommands, '', parentOwnKeys);
        if (keys.length) { //同样，当包含数据更新的key时才进行深入分析
            for (var i = 0, key; i < keys.length; i++) {
                key = keys[i].trim();
                tmplInfo.keys.push(key);
            }
            list.push(tmplInfo);
            //属性分析
            addAttrs(tag, match, tmplInfo, refTmplCommands, cssNamesMap);
        } else { //记录移除的guid
            removeGuids.push(guid);
        }
    });
    while (subs.length) { //开始递归调用
        var sub = subs.shift();
        var i = buildTmpl(sub.tmpl, refTmplCommands, cssNamesMap, list, sub.ownKeys, globalKeys);
        //if (sub.tmplInfo) {
        sub.tmplInfo.tmpl = i.tmpl;
        //}
    }
    tmpl = tmplClass.process(tmpl, cssNamesMap); //处理class name
    tmpl = commandAnchorRecover(tmpl, refTmplCommands); //恢复模板命令
    for (var i = removeGuids.length; i >= 0; i--) { //删除没用的guid
        tmpl = tmpl.replace(' ' + removeGuids[i], '');
    }
    return {
        list: list,
        tmpl: tmpl,
        keys: globalKeys
    };
};
module.exports = {
    process: buildTmpl
};