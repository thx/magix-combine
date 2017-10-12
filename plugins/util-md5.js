/*
    md5转换，最初使用的md5，后期修改成sha512，但md5这个名称未换
 */
let vkeys = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
let variable = count => { //压缩变量
    let result = '',
        temp;
    do {
        temp = count % vkeys.length;
        result = vkeys.charAt(temp) + result;
        count = (count - temp) / vkeys.length;
    }
    while (count);
    return result;
};
let counter = Object.create(null);
let cache = Object.create(null);
module.exports = (text, configKey, prefix) => {
    if (!counter[configKey]) {
        counter[configKey] = 0;
    }
    if (!cache[configKey]) {
        cache[configKey] = Object.create(null);
    }
    let rstr = cache[configKey][text];
    if (rstr) {
        return rstr;
    }
    let c = counter[configKey];
    rstr = variable(c);
    counter[configKey] = ++c;
    if (prefix) {
        rstr = prefix + '_' + rstr;
    }
    cache[configKey][text] = rstr;
    return rstr;
};