/*
    处理样式规则中的@规则
 */
let regexp = require('./util-rcache');
let {
    genCssSelector
} = require('./css-selector');
let ruleEndReg = /[;\r\n]/;
let trimQ = /^['"]|['"]$/g;
//以@开始的名称，如@font-face
//charset不处理，压缩器会自动处理
let fontfaceReg = /(?:^|[\s\}])@\s*font-face\s*\{([^\{\}]*)\}/g;
//keyframes，如@-webkit-keyframes xx
let keyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+(['"])?([\w\-]+)\3/g;
//let fontFalilyReg = /font-family\s*:\s*(['"])?([\w\-\s$]+)\1/;
let genCssContentReg = key => {
    return regexp.get('\\b(font-family|animation|animation-name)\\s*:([^\\{\\}:\\r\\n\\(\\)]*?)([\'"])?' + regexp.escape(key) + '\\3(?=[,\\s;])', 'g');
};
//css @规则的处理
module.exports = (fileContent, cssNamesKey) => {
    let contents = [];
    //先处理keyframes
    fileContent = fileContent.replace(keyframesReg, (m, head, keyframe, q, name) => {
        //把名称保存下来，因为还要修改使用的地方
        contents.push(name);
        name = genCssSelector(name, cssNamesKey);
        q = q || '';
        //增加前缀
        return head + keyframe + ' ' + q + name + q;
    });
    //处理其它@规则，这里只处理了font-face
    fileContent.replace(fontfaceReg, (match, content) => {
        //if (key == 'font-face') {
        //font-face只处理font-family font-family名称只要用引号引起，几乎可以用任意字符
        //fontFalilyReg.lastIndex = 0;
        //let m = content.match(fontFalilyReg);
        //if (m) {
        //    //同样保存下来，要修改使用的地方
        //    contents.push(m[2]);
        //}
        //}
        let rules = content.split(ruleEndReg);
        for (let rule of rules) {
            let parts = rule.split(':');
            if (parts.length && parts[0].trim() === 'font-family') {
                let fname = parts[1].trim();
                fname = fname.replace(trimQ, '');
                contents.push(fname);
                break;
            }
        }
    });
    //contents中目前只有@font-face及@keyframes2种
    while (contents.length) {
        let t = contents.pop();
        let reg = genCssContentReg(t);
        t = genCssSelector(t, cssNamesKey);
        fileContent = fileContent.replace(reg, '$1:$2$3' + t + '$3');
    }
    //console.log(fileContent);
    return fileContent;
};