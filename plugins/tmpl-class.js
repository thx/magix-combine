//模板，处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理

var configs = require('./util-config');
var classReg = /\bclass\s*=\s*(['"])([^'"]+)(?:\1)/g;
var classNameReg = /(\s|^|\b)([\w\-]+)(?=\s|$|\b)/g;
var pureTagReg = /<\w+[^>]*>/g;
module.exports = {
    process: function(tmpl, cssNamesMap) {
        var classResult = function(m, h, n) {
            return h + (cssNamesMap[n] || n);
        };
        var classProcessor = function(m, q, c) {
            return 'class=' + q + c.replace(classNameReg, classResult) + q;
        };
        var pureProcessor = function(match) {
            match = configs.cssNamesProcessor(match, cssNamesMap);
            return match.replace(classReg, classProcessor); //保证是class属性
        };
        if (cssNamesMap) {
            //为了保证安全，我们一层层进入
            tmpl = tmpl.replace(pureTagReg, pureProcessor); //保证是标签
        }
        return tmpl;
    }
};