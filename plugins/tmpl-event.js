//模板中事件的提取，主要为brix-event模块提供：https://github.com/thx/brix-event/blob/master/src/brix/event.js#L15
var pureTagReg = /<\w+[^>]*>/g;
var attrsNameValueReg = /([^\s]+)=(["'])[\s\S]+?\2/ig;
var eventReg = /mx-(?!view|vframe|keys|options|data|partial|init)[a-zA-Z]+/;
module.exports = {
    extract: function(tmpl) {
        var map = {};
        tmpl.replace(pureTagReg, function(match) {
            match.replace(attrsNameValueReg, function(m, key) {
                if (eventReg.test(key)) {
                    map[key.slice(3)] = 1;
                }
            });
        });
        return Object.keys(map);
    }
};