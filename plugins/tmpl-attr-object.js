/*
处理模板属性中的对象，如 mx-click="open({a:'abc\'def'})"
需要对单引号做特殊处理
转换如 <%:[input,change] user.name {refresh,state:user,flag:'abc\'def'}%>
中的object成 {refresh:'refresh',state:'<%=user%>',flag:'abc\&#x27;def'}

 */
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let Q = {
    '\'': '&#39;',
    '"': '&#34;'
};
let Cache = Object.create(null);
let QReg = /['"]/g;
let asciiStart = /[A-Za-z\$\_]/;
let asciiIdentifier = /[A-Za-z\$\_\d]/;
let EscapeQ = str => str.replace(QReg, m => Q[m]);
let MakeError = msg => {
    throw new Error(msg);
};
let keyword = /^(?:true|false|null|undefined)\b/;
let stringReg = /^['"]/;

module.exports = {
    escapeQ: EscapeQ,
    parseObject(str, startChar, endChar) {
        str = '(' + str.trim() + ')';
        let ast = acorn.parse(str);
        let modifiers = [];
        let processString = node => {
            stringReg.lastIndex = 0;
            if (stringReg.test(node.raw)) {
                let q = node.raw.charAt(0);
                let value = node.raw.slice(1, -1);
                if (q == '"') {
                    q = '\'';
                    value = value.replace(/'/g, '\\\'');
                }
                value = EscapeQ(value);
                modifiers.push({
                    start: node.start,
                    end: node.end,
                    value: q + value + q
                });
            }
        };
        walker.simple(ast, {
            Property(node) {
                let key = node.key;
                let value = node.value;
                if (key.type == 'Literal') {
                    processString(key);
                }
                if (value.type == 'Identifier' || value.type == 'MemberExpression') {
                    let oValue = str.slice(value.start, value.end);
                    if (node.shorthand) {
                        modifiers.push({
                            start: node.end,
                            end: node.end,
                            value: ':' + endChar + '",' + oValue + ',"' + startChar
                        });
                    } else if (node.computed) {
                        modifiers.push({
                            start: key.start - 1,
                            end: key.end + 1,
                            value: endChar + '",' + str.slice(key.start, key.end) + ',"' + startChar
                        }, {
                            start: value.start,
                            end: value.end,
                            value: endChar + '",' + oValue + ',"' + startChar
                        });
                    } else {
                        modifiers.push({
                            start: value.start,
                            end: value.end,
                            value: endChar + '",' + oValue + ',"' + startChar
                        });
                    }
                }
            },
            Literal: processString
        });

        modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
            return a.start - b.start;
        });
        for (let i = modifiers.length - 1, m; i >= 0; i--) {
            m = modifiers[i];
            str = str.slice(0, m.start) + m.value + str.slice(m.end);
        }
        console.log(str);
        return '"' + startChar + str.slice(1, -1) + '"';
    },
    likeObject(str) {
        str = str.trim();
        if (Cache[str]) {
            return Cache[str];
        }
        let index = 0;
        let end = str.length;
        let r = '';
        let key = '';
        let value = '';
        let inKey = 0;
        let inValue = 0;
        let valueIsString = 0;
        let qType;
        let variable = 0;
        while (index < end) {
            let c = str.charAt(index);
            if (c == '{') {
                if (!inKey && !inValue) { //不在key和value，初始化
                    r += ',"\u0017{';
                    inKey = 1;
                } else if (inKey) {
                    MakeError('bad key. Input:' + str);
                } else if (inValue) {
                    if (valueIsString) {
                        value += c;
                    } else {
                        MakeError('bad value. Input:' + str);
                    }
                }
            } else if (c == ',' || c == '}') {
                if (inKey) {
                    if (!key) {
                        MakeError('missing key. Input:' + str);
                    }
                    //value = '\'' + key + '\'';
                    r += key + ':",' + key + ',"' + c + (c == '}' ? '"' : '');
                    key = '';
                    value = '';
                    variable = 0;
                } else if (inValue) {
                    if (valueIsString) {
                        value += c;
                    } else {
                        r += value;
                        if (variable) {
                            r += ',"\u0017';
                        }
                        if (c == '}') {
                            r += '}"';
                        } else {
                            r += ',';
                        }
                        inValue = 0;
                        inKey = 1;
                        value = '';
                    }
                } else {
                    r += c + (c == '}' ? '"' : '');
                    //break; //如果后续还有内容，则提示非法的输入，所以这里不break
                    if (c == ',') {
                        inKey = 1;
                    }
                }
            } else if (c == ':') {
                if (inValue) {
                    if (valueIsString) {
                        value += c;
                    } else {
                        MakeError('bad value. Input:' + str);
                    }
                } else {
                    inKey = 0;
                    r += key + c;
                    key = '';
                    inValue = 1;
                }
            } else if (inKey) {
                if (!asciiIdentifier.test(c)) {
                    MakeError('unsupport composite key or value. Input:' + str);
                }
                key += c;
            } else if (inValue) {
                if (inValue == 1) {
                    if (c == '\'' || c == '"') {
                        variable = 0;
                        qType = c;
                        if (c == '"') c = '\''; //转换
                        r += c;
                        //index++;
                        //c = str.charAt(index);
                        valueIsString = 1;
                    } else { //变量
                        valueIsString = 0;
                        let temp = str.slice(index, index + 10);
                        variable = asciiStart.test(c) && !keyword.test(temp);
                        if (variable) {
                            r += '",';
                        }
                        inValue++;
                    }
                } else if (valueIsString) {
                    if (c == '\\') {
                        value += c;
                        index++;
                        c = str.charAt(index);
                    } else if (c == qType) {
                        inValue = 0;
                        if (qType == '"' && c == '"') c = '\'';
                        r += EscapeQ(value) + c;
                        value = '';
                    } else if (c == '\'' && qType == '"') {
                        value += '\\';
                    }
                }
                if (inValue) {
                    if (inValue > 1) {
                        value += c;
                    }
                    inValue++;
                }
            } else if (c != ' ') {
                throw new Error('bad input:' + str);
            }
            index++;
        }
        return (Cache[str] = r);
    },
    native(str) {
        str = str.trim();
        if (Cache[str]) {
            return Cache[str];
        }
        let c = ' ';
        let index = 0;
        let r = '';
        let next = (ch) => {
            if (ch && c !== ch) {
                MakeError('Expected "' + ch + '" instead of "' + c + '"');
            }
            c = str.charAt(index);
            index = index + 1;
            return c;
        };
        let white = () => {
                while (c && (c == ' ' || c == '\r' || c == '\n' || c == '\t')) {
                    next();
                }
            },
            value;
        let string = () => {
            let q, temp = '',
                end = 0;
            q = c;
            while (index < str.length) {
                c = str.charAt(index);
                if (c == '\\') {
                    index++;
                    temp += str.charAt(index);
                } else if (c == q) {
                    end = 1;
                    index++;
                    break;
                } else {
                    temp += c;
                }
                index++;
            }
            if (end) {
                r += '\'' + EscapeQ(temp) + '\'';
                c = str.charAt(index++);
            }
            return end;
        };
        let objectKey = () => {
            if (c == '"' || c == '\'') {
                if (string()) {
                    return;
                }
            } else {
                let colon = str.indexOf(':', index);
                if (colon > -1) {
                    let key = str.slice(index - 1, colon).trim();
                    index = colon;
                    c = str.charAt(index++);
                    r += key;
                    return;
                }
            }
            MakeError('bad key. Input:' + str);
        };
        let array = () => {
            if (c === '[') {
                next('[');
                r += '[';
                white();

                if (c === ']') {
                    next(']');
                    r += ']';
                    return; // 空数组
                }

                while (c) {
                    value();
                    white();
                    if (c === ']') {
                        next(']');
                        r += ']';
                        return;
                    }
                    next(',');
                    r += ',';
                    white();
                }
            }
            MakeError('bad array. Input:' + str);
        };
        let object = () => {
            if (c === '{') {
                next('{');
                r += '{';
                white();

                if (c === '}') {
                    next('}');
                    r += '}';
                    return; // 空对象
                }

                while (c) {
                    objectKey();
                    next(':');
                    r += ':';
                    value();
                    white();
                    if (c === '}') {
                        next('}');
                        r += '}';
                        return;
                    }
                    next(',');
                    r += ',';
                    white();
                }
            }
            MakeError('bad object. Input:' + str);
        };
        let any = () => {
            while (c) {
                if (c == ',' || c == '}') {
                    break;
                }
                r += c;
                next();
            }
        };
        value = () => {
            white();
            switch (c) {
                case '{':
                    object();
                    break;
                case '[':
                    array();
                    break;
                case '"':
                case '\'':
                    string();
                    break;
                default:
                    any();
                    break;
            }
        };
        value(str);
        return (Cache[str] = r);
    }
};