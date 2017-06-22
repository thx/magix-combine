let crypto = require('crypto');
let slog = require('./util-log');
let md5Cache = Object.create(null); //md5 cache对象
let md5ResultKey = '\u0000'; //一个特殊前缀，因为要把源字符串结果及生成的3位md5存放在同一个对象里，加一个前缀以示区别
module.exports = (text, len, configKey) => {
    if (md5Cache[text]) return md5Cache[text];
    //let buf = new Buffer(text);
    //let str = buf.toString('binary');
    let str = crypto.createHash('sha512').update(text, 'ascii').digest('hex');
    //console.log(str,text);
    let c = 0;
    let rstr = str.substring(c, c + len); //从md5字符串中截取len个，md5太长了，len位足够，不使用随机数是因为我们要针对同一个文件每次生成的结果要相同
    while ((c + len) < str.length && md5Cache[md5ResultKey + rstr] == 1) { //不同的文件，但生成了相同的key
        c++;
        rstr = str.substring(c, c + len);
    }
    if (md5Cache[md5ResultKey + rstr] == 1) {
        if (!configKey) configKey = 'md5CssSelectorLen';
        let msg = 'generate "' + text + '" duplicate md5 result,please update config ' + configKey;
        slog.ever(msg.red);
        throw new Error(msg);
    }
    md5Cache[text] = rstr;
    md5Cache[md5ResultKey + rstr] = 1;
    return rstr;
};