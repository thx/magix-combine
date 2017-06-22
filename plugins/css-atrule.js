let configs = require('./util-config');
let md5 = require('./util-md5');
//以@开始的名称，如@font-face
//charset不处理，压缩器会自动处理
let cssAtNamesKeyReg = /(?:^|[\s\}])@([a-z\-]+)\s*(?:[\w\-]+)?\{([^\{\}]*)\}/g;
//keyframes，如@-webkit-keyframes xx
let cssKeyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+(['"])?([\w\-]+)\3/g;
let genCssContentReg = key => {
    let reg = genCssContentReg[key];
    if (!reg) {
        reg = new RegExp(':\\s*([\'"])?' + key.replace(/[\-#$\^*()+\[\]{}|\\,.?\s]/g, '\\$&') + '\\1', 'g');
        genCssContentReg[key] = reg;
    }
    return reg;
};
//css @规则的处理
module.exports = (fileContent, cssNamesKey) => {
    let contents = [];
    //先处理keyframes
    fileContent = fileContent.replace(cssKeyframesReg, (m, head, keyframe, q, name) => {
        //把名称保存下来，因为还要修改使用的地方
        contents.push(name);
        if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
            if (name.length > configs.md5CssSelectorLen) {
                name = md5(name, configs.md5CssSelectorLen);
            }
        }
        //增加前缀
        return head + keyframe + ' ' + cssNamesKey + '-' + name;
    });
    //处理其它@规则，这里只处理了font-face
    fileContent = fileContent.replace(cssAtNamesKeyReg, (match, key, content) => {
        if (key == 'font-face') {
            //font-face只处理font-family
            let m = content.match(/font-family\s*:\s*(['"])?([\w\-]+)\1/);
            if (m) {
                //同样保存下来，要修改使用的地方
                contents.push(m[2]);
            }
        }
        return match;
    });
    while (contents.length) {
        let t = contents.pop();
        let reg = genCssContentReg(t);
        if (configs.compressCss && configs.compressCssSelectorNames) { //压缩，我们采用md5处理，同样的name要生成相同的key
            if (t.length > configs.md5CssSelectorLen) {
                t = md5(t, configs.md5CssSelectorLen);
            }
        }
        fileContent = fileContent.replace(reg, ':$1' + cssNamesKey + '-' + t + '$1');
    }
    return fileContent;
};