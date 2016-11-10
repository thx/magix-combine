//模板，增加guid标识，仅针对magix-updater使用：https://github.com/thx/magix-updater
var tagReg = /<([\w]+)([^>]*?)mx-keys\s*=\s*"([^"]+)"([^>]*?)>/g;
module.exports = {
    add: function(tmpl, key, refGuidToKeys) {
        var g = 0;
        return tmpl.replace(tagReg, function(match, tag, preAttrs, keys, attrs, tKey) {
            g++;
            tKey = 'mx-guid="x' + key + g + '"';
            refGuidToKeys[tKey] = keys;
            return '<' + tag + preAttrs + tKey + attrs + '>';
        });
    }
};