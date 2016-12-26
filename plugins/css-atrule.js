var configs = require('./util-config');
var md5 = require('./util-md5');
//以@开始的名称，如@font-face
var cssAtNamesKeyReg = /(^|[\s\}])@([a-z\-]+)\s*([\w\-]+)?\{([^\{\}]*)\}/g;
//keyframes，如@-webkit-keyframes xx
var cssKeyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+([\w\-]+)/g;
//css @规则的处理
module.exports = function(fileContent, cssNamesKey) {
    var contents = [];
    //先处理keyframes
    fileContent = fileContent.replace(cssKeyframesReg, function(m, head, keyframe, name) {
        //把名称保存下来，因为还要修改使用的地方
        contents.push(name);
        if (configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
            if (name.length > configs.md5KeyLen) {
                name = md5(name);
            }
        }
        //增加前缀
        return head + keyframe + ' ' + cssNamesKey + '-' + name;
    });
    //处理其它@规则，这里只处理了font-face
    fileContent = fileContent.replace(cssAtNamesKeyReg, function(match, head, key, name, content) {
        if (key == 'font-face') {
            //font-face只处理font-family
            var m = content.match(/font-family\s*:\s*(['"])?([\w\-]+)\1/);
            if (m) {
                //同样保存下来，要修改使用的地方
                contents.push(m[2]);
            }
        }
        return match;
    });
    while (contents.length) {
        var t = contents.pop();
        //修改使用到的地方
        var reg = new RegExp(':\\s*([\'"])?' + t.replace(/[\-#$\^*()+\[\]{}|\\,.?\s]/g, '\\$&') + '\\1', 'g');
        if (configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
            if (t.length > configs.md5KeyLen) {
                t = md5(t);
            }
        }
        fileContent = fileContent.replace(reg, ':$1' + cssNamesKey + '-' + t + '$1');
    }
    return fileContent;
};