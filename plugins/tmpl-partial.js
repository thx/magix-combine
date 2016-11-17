var tmplCmd = require('./tmpl-cmd');
var configs = require('./util-config');
var tmplClass = require('./tmpl-class');
//模板，子模板的处理，仍然是配合magix-updater：https://github.com/thx/magix-updater
//生成子模板匹配正则
var subReg = (function() {
    var temp = '<([\\w]+)[^>]*?(mx-guid="x[^"]+")[^>]*?>(#)</\\1>';
    var start = 12; //嵌套12层在同一个view中也足够了
    while (start--) {
        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
    }
    temp = temp.replace('#', '(?:[\\s\\S]*?)');
    return new RegExp(temp, 'ig');
}());
var holder = '\u001f';
//属性正则
var attrsNameValueReg = /([^\s]+)=(["'])([\s\S]+?)\2/ig;
//自闭合标签，需要开发者明确写上如 <input />，注意>前的/,不能是<img>
var selfCloseTag = /<(\w+)\s+[^>]*?(mx-guid="x[^"]+")[^>]*?\/>/g;
//标签
var pureTagReg = /<(\w+)[^>]*>/g;
//模板引擎命令被替换的占位符
var tmplCommandAnchorReg = /\u001e\d+\u001e/g;
var tmplCommandAnchorRegTest = /\u001e\d+\u001e/;
//属性处理
var attrProps = {
    'class': 'className',
    'value': 'value',
    'checked': 'checked',
    'disabled': 'disabled',
    'readonly': 'readonly'
};
//哪些标签需要修复属性，如div上写上readonly是不需要做处理的
var fixedAttrPropsTags = {
    'input': 1,
    'select': 1,
    'textarea': 1
};
//恢复被替换的模板引擎命令
var commandAnchorRecover = function(tmpl, refTmplCommands) {
    return tmplCmd.recover(tmpl, refTmplCommands);
};
//添加属性信息
var addAttrs = function(tag, tmpl, info, keysReg, refTmplCommands) {
    var attrsKeys = {},
        tmplKeys = {};
    //处理属性
    tmpl.replace(attrsNameValueReg, function(match, name, quote, content) {
        var findUserMxKey = false,
            aInfo,
            nameStartWidthAt = name.charAt(0) == '@';
        if (nameStartWidthAt) {
            name = name.slice(1);
        }
        //如果是mx-view属性
        if (name == 'mx-view') {
            //设置view信息
            info.view = commandAnchorRecover(content, refTmplCommands);
        }
        if (tmplCommandAnchorRegTest.test(content)) {
            //有模板引擎命令
            /*
                <div mx-keys="a,b,c" data-a="<%=a%>">
                    <%=b%>-<%=c%>
                </div>
                考虑这样的结构，当a变化时，我们只需要更新属性，b或c有变化时更新div的内容
                也有这样的情况
                <div mx-keys="a,b,c" data-a="<%=a%>">
                    <%=b%>-<%=c%>-<%=a%>
                </div>
                a变化时即要更新属性也要更新内容，下面的代码就是精确识别这种情形以达到最优的更新性能
             */
            content = content.replace(tmplCommandAnchorReg, function(match) {
                var value = refTmplCommands[match]; //获取原始命令
                if (!findUserMxKey) {
                    for (var i = 0; i < keysReg.length; i++) { //查找用户给出的mx-keys是否在模板命令里，这块是性能优化用的
                        if (keysReg[i].test(value)) {
                            findUserMxKey = true;
                            break;
                        }
                    }
                }
                if (findUserMxKey) {
                    var words = value.match(/\w+/g); //获取模板命令中的单词
                    if (words) {
                        for (var i = words.length - 1; i >= 0; i--) {
                            attrsKeys[words[i]] = 1;
                        }
                    }
                }
                return value;
            });
            if (findUserMxKey) {
                var key = attrProps[name]; //属性
                aInfo = {
                    n: key || name,
                    v: content
                };
                //需要特殊处理的
                if (key && fixedAttrPropsTags[tag] == 1 || name == 'class') {
                    aInfo.p = 1;
                }
                //如果属性是以@开头的，我们调用外部的处理器处理
                if (nameStartWidthAt) { //添加到tmplData中，对原有的模板不修改
                    aInfo.v = configs.atAttrProcessor(name, aInfo.v, {
                        tag: tag,
                        prop: aInfo.p,
                        partial: true
                    });
                    if (!aInfo.p) {
                        aInfo.a = 1;
                    }
                }
                if (name != 'mx-view') { //如果不是mx-view属性则加入到属性列表中，mx-view会特殊处理
                    info.attrs.push(aInfo);
                }
            }
        }
    });
    if (info.tmpl && info.attrs.length) { //有模板及属性
        //接下来我们处理前面的属性和内容更新问题
        info.tmpl.replace(tmplCommandAnchorReg, function(match) {
            var value = refTmplCommands[match];
            var words = value.match(/\w+/g);
            if (words) {
                for (var i = words.length - 1; i >= 0; i--) {
                    tmplKeys[words[i]] = 1;
                }
            }
        });
        var mask = '';
        for (var i = 0, m; i < info.keys.length; i++) {
            m = 0;
            //如果key存在内容模板中，则m为1
            if (tmplKeys[info.keys[i]]) m = 1;
            //如果key存在属性中,则m为2或者或上1
            if (attrsKeys[info.keys[i]]) m = m ? m | 2 : 2;
            mask += m + '';
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
//展开@属性，主要是模板命令恢复及调用外部处理器
var expandAtAttr = function(tmpl, refTmplCommands) {
    return tmpl.replace(pureTagReg, function(match, tag) {
        return match.replace(attrsNameValueReg, function(match, name, quote, content) {
            if (name.charAt(0) == '@') {
                content = commandAnchorRecover(content, refTmplCommands);
                match = configs.atAttrProcessor(name.slice(1), content, {
                    tag: tag,
                    prop: attrProps[name] && fixedAttrPropsTags[tag]
                });
            }
            return match;
        });
    });
};
//递归构建子模板
var buildTmpl = function(tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, parentOwnKeys, globalKeys) {
    if (!list) {
        list = [];
        g = 0;
        globalKeys = {};
    }
    var subs = [];
    //子模板
    tmpl = tmpl.replace(subReg, function(match, tag, guid, content) { //清除子模板后
        var ownKeys = {};
        for (var p in parentOwnKeys) {
            ownKeys[p] = parentOwnKeys[p];
        }
        var tmplInfo = {
            s: ++g,
            keys: [],
            tmpl: content,
            path: tag + '[' + guid + ']',
            attrs: []
        };
        var keysReg = [];
        if (parentOwnKeys) {
            tmplInfo.pKeys = Object.keys(parentOwnKeys);
        }
        var datakey = refGuidToKeys[guid];
        var keys = datakey.split(',');
        for (var i = 0, key; i < keys.length; i++) {
            key = keys[i].trim();
            tmplInfo.keys.push(key);
            ownKeys[key] = 1;
            globalKeys[key] = 1;
            keysReg.push(new RegExp('\\b' + key + '\\b'));
        }
        list.push(tmplInfo);
        var remain;
        if (tag == 'textarea') { //textarea特殊处理，因为textarea可以有节点内容
            addAttrs(tag, remain = match, tmplInfo, keysReg, refTmplCommands);
            tmplInfo.attrs.push({
                n: 'value',
                v: commandAnchorRecover(tmplInfo.tmpl, refTmplCommands),
                p: 1
            });
            delete tmplInfo.guid;
            delete tmplInfo.tmpl;
            delete tmplInfo.mask;
        } else {
            if (tmplCommandAnchorRegTest.test(content)) { //内容中有模板
                remain = match.replace('>' + content, '>' + holder + g + holder);
                subs.push({
                    tmpl: content,
                    ownKeys: ownKeys,
                    tmplInfo: tmplInfo
                });
            } else { //只处理属性
                remain = match;
                content = '';
                delete tmplInfo.tmpl;
                delete tmplInfo.guid;
            }
            addAttrs(tag, remain, tmplInfo, keysReg, refTmplCommands);
            if (!tmplInfo.attrs.length) { //没有属性
                delete tmplInfo.attrs;
            }
            if (!tmplInfo.view && !tmplInfo.tmpl && !tmplInfo.attrs) { //即没模板也没属性，则删除
                list.pop();
            }
        }
        return remain;
    });
    //自闭合
    tmpl.replace(selfCloseTag, function(match, tag, guid) {
        var tmplInfo = {
            keys: [],
            path: tag + '[' + guid + ']',
            attrs: []
        };
        var keysReg = [];
        var datakey = refGuidToKeys[guid];
        var keys = datakey.split(',');
        for (var i = 0, key; i < keys.length; i++) {
            key = keys[i].trim();
            tmplInfo.keys.push(key);
            keysReg.push(new RegExp('\\b' + key + '\\b'));
        }
        list.push(tmplInfo);
        addAttrs(tag, match, tmplInfo, keysReg, refTmplCommands);
        if (!tmplInfo.attrs.length) {
            delete tmplInfo.attrs;
        }
    });
    tmpl = expandAtAttr(tmpl, refTmplCommands);
    while (subs.length) {
        var sub = subs.shift();
        var i = buildTmpl(sub.tmpl, refGuidToKeys, refTmplCommands, cssNamesMap, g, list, sub.ownKeys, globalKeys);
        sub.tmplInfo.tmpl = i.tmpl;
    }
    tmpl = tmplClass.process(tmpl, cssNamesMap);
    tmpl = commandAnchorRecover(tmpl, refTmplCommands);
    return {
        list: list,
        tmpl: tmpl,
        keys: globalKeys
    };
};
module.exports = {
    process: buildTmpl
};