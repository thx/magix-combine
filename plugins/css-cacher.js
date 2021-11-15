
const fse = require('fs-extra')

const cssCacheMap = new Map()

const cssCacher = {
    get (file) {
        let stat
        try {
            stat = fse.statSync(file)
        } catch (error) {
            return null
        }
        const info = cssCacheMap.get(file)
        if (!info) {
            return null
        }
        /** 如果修改时间不同，则取消缓存 */
        if (stat.mtime.getTime() !== info.stat.mtime.getTime()) {
            return null
        }
        return info
    },
    set (file, info) {
        const stat = fse.statSync(file)
        info.stat = stat
        cssCacheMap.set(file, info)
    },
}

module.exports = cssCacher