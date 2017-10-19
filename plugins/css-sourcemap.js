let path = require('path');
module.exports = (map, file, opts = {}) => {
    if (map) {
        map = JSON.parse(map);
        if (opts.rebuildSources) {
            let dir = path.dirname(file);
            map.sources = map.sources.map(it => {
                return path.resolve(path.join(dir, it));
            });
        }
        map.file = file;
        map = JSON.stringify(map);
        map = '\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,' + new Buffer(map).toString('base64') + ' */';
        return map;
    }
    return '';
};