var tmplCmd = require('./tmpl-cmd');
//模板，增加guid标识，仅针对magix-updater使用：https://github.com/thx/magix-updater
var tagReg = /<([\w]+)([^>]*?)(\/)?>/g;
//var keysTagReg = /<([\w]+)([^>]*?)mx-keys\s*=\s*"[^"]+"([^>]*?)>/g;
var holder = '\u001f';
var slashReg = /\//g;
var tmplCommandAnchorRegTest = /\u001e\d+\u001e/;
var subReg = (function() {
    var temp = '<([\\w]+)([^>]*?)>(#)</\\1>';
    var start = 12; //嵌套12层在同一个view中也足够了
    while (start--) {
        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
    }
    temp = temp.replace('#', '[\\s\\S]*?');
    return new RegExp(temp, 'ig');
}());
var subRegWithGuid = (function() {
    var temp = '<([\\w]+)(\\s+mx-guid="g[^"]+")([^>]*?)>(#)</\\1>';
    var start = 12; //嵌套12层在同一个view中也足够了
    while (start--) {
        temp = temp.replace('#', '(?:<\\1[^>]*>#</\\1>|[\\s\\S])*?');
    }
    temp = temp.replace('#', '[\\s\\S]*?');
    return new RegExp(temp, 'ig');
}());
var selfCloseTagWithGuid = /<(\w+)(\s+mx-guid="g[^"]+")([^>]*?)\/>/g;
var selfCloseTag = /<\w+[^>]*?\/>/g;
var guidReg = /\s+mx-guid="g[^"]+"/g;
var vdReg = /\u0002(\w+)\b/g;
var idReg = /\u0001(\w+)\b/g;
var globalRegTest = /\u0003/;
var removeVdReg = /\u0002/g;
var removeIdReg = /\u0001/g;
var vdMatchId = function(tmpl, tmplCommands) {
    var c = tmplCmd.recover(tmpl, tmplCommands);
    if (!globalRegTest.test(c)) { //不存在全局的变量，不用局部刷新
        return false;
    }
    var vds = {};
    var ids = {};
    c.replace(vdReg, function(m, key) { //变量声明
        vds[key] = 1;
    });
    c.replace(idReg, function(m, key) { //变量使用
        ids[key] = 1;
    });
    //console.log(c,vds,ids);
    var idKeys = Object.keys(ids);
    for (var i = idKeys.length - 1; i >= 0; i--) {
        if (!vds[idKeys[i]]) { //如果使用的变量未在声明里，则表示当前区域是不完整的
            return false;
        }
    }
    return true;
};
module.exports = {
    add: function(tmpl, tmplCommands) {
        var g = 0;
        var r = tmpl.replace(selfCloseTag, '').replace(subReg, '');
        if (tmplCommandAnchorRegTest.test(r)) {
            tmpl = '<div>' + tmpl + '</div>';
        }
        tmpl = tmpl.replace(tagReg, function(match, tag, attrs, close, tKey) {
            if (close && !tmplCommandAnchorRegTest.test(match)) {
                tKey = '';
            } else {
                tKey = ' mx-guid="g' + (g++).toString(16) + holder + '"';
            }
            return '<' + tag + tKey + attrs + (close ? close : '') + '>';
        });
        g = 0;
        var removeGuid = function(tmpl) {
            //如果移除子节点后无模板命令和属性中的模板命令，则移除guid
            //如果剩余内容+属性配对，则保留guid
            //如果剩余内容+属性不配对，则删除guid
            //console.log('removeGuids',tmpl);
            tmpl = tmpl.replace(selfCloseTagWithGuid, function(match, tag, guid, attrs) {
                //console.log(attrs,tmplCommandAnchorRegTest.test(attrs) , vdMatchId(attrs, tmplCommands));
                if (tmplCommandAnchorRegTest.test(attrs) && vdMatchId(attrs, tmplCommands)) {
                    guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                    return '<' + tag + guid + attrs + '/>';
                }
                return '<' + tag + attrs + '/>';
            });
            //console.log('tt',tmpl);
            tmpl = tmpl.replace(subRegWithGuid, function(match, tag, guid, attrs, content) {
                //console.log(attrs);
                //attrs = attrs.replace(/\//g, '\u0004');
                var tContent = content.replace(selfCloseTag, '').replace(subRegWithGuid, '');
                content = removeGuid(content);
                if (tmplCommandAnchorRegTest.test(tContent + attrs) && vdMatchId(attrs + tContent, tmplCommands)) {
                    //console.log(attrs);
                    attrs = attrs.replace(slashReg, '\u0004'); //把/换掉，防止在子模板分析中分析自闭合标签时不准确
                    //console.log('origin content',content,'---',tContent);
                    var removeGuids = tContent.match(guidReg);
                    if (removeGuids) {
                        removeGuids.forEach(function(g) {
                            content = content.replace(g, '');
                        });
                    }
                    guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                    //console.log('removeGuids',removeGuids,tContent,content);
                    //console.log('m', content, 'x', tContent);
                    return '<' + tag + guid + attrs + '>' + content + '</' + tag + '>';
                }
                tContent = content.replace(selfCloseTagWithGuid, '').replace(subRegWithGuid, '');
                //console.log(tContent, '----', match, '====', content);
                if (tmplCommandAnchorRegTest.test(tContent) && vdMatchId(tContent, tmplCommands)) {
                    guid = ' mx-guid="g' + (g++).toString(16) + holder + '"';
                    return '<' + tag + guid + attrs + '>' + content + '</' + tag + '>';
                }
                return '<' + tag + attrs + '>' + content + '</' + tag + '>';
            });
            return tmpl;
        };
        tmpl = removeGuid(tmpl);
        //console.log(tmpl);

        for (var p in tmplCommands) {
            tmplCommands[p] = tmplCommands[p].replace(removeVdReg, '').replace(removeIdReg, '');
        }
        //console.log(tmpl,tmplCommands);
        return tmpl;
    }
};