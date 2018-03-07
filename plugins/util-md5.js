/*
    md5转换，最初使用的md5，后期修改成sha512，但md5这个名称未换
 */
let vkeys = '_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
let vkeysWithNumber = vkeys + '0123456789#!@$%^&*(){}[]|\\,.?`~/;:-+';
let variable = (count, withNumber) => { //压缩变量
    let result = '',
        temp,
        keys = withNumber ? vkeysWithNumber : vkeys;
    do {
        temp = count % keys.length;
        result = keys.charAt(temp) + result;
        count = (count - temp) / keys.length;
    }
    while (count);
    return result;
};
let counter = Object.create(null);
let cache = Object.create(null);
let md5 = (text, configKey, prefix, withNumber) => {
    text += '';
    if (configKey == 'revisableString') {
        let temp = text.split('#');
        if (temp.length > 1) {
            configKey = temp[0];
        }
    }
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
    rstr = variable(c, withNumber);
    counter[configKey] = ++c;
    if (prefix) {
        rstr = prefix + rstr;
    }
    cache[configKey][text] = rstr;
    return rstr;
};
md5.byNum = variable;
module.exports = md5;