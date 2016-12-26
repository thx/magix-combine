var crypto = require('crypto');
var Buffer = require('buffer').Buffer;
var configs = require('./util-config');
var md5Cache = {}; //md5 cache对象
var md5ResultKey = '_$%'; //一个特殊前缀，因为要把源字符串结果及生成的3位md5存放在同一个对象里，加一个前缀以示区别
module.exports = function(text) {
    if (md5Cache[text]) return md5Cache[text];
    var buf = new Buffer(text);
    var str = buf.toString('binary');
    str = crypto.createHash('md5').update(str).digest('hex');
    var c = 0;
    var len = configs.md5KeyLen;
    var rstr = str.substring(c, c + len); //从md5字符串中截取len个，md5太长了，len位足够，不使用随机数是因为我们要针对同一个文件每次生成的结果要相同
    while ((c + len) < str.length && md5Cache[md5ResultKey + rstr] == 1) { //不同的文件，但生成了相同的key
        c++;
        rstr = str.substring(c, c + len);
    }
    if (md5Cache[md5ResultKey + rstr] == 1) {
        throw new Error('duplicate md5 result,please update config md5KeyLen>' + len);
    }
    md5Cache[text] = rstr;
    md5Cache[md5ResultKey + rstr] = 1;
    return rstr;
};