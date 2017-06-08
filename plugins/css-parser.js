/*
    http://www.w3school.com.cn/cssref/css_selectors.asp
    简易parser，只处理类与标签，其中
    processRules 参考了这个：https://github.com/fb55/css-what/blob/master/index.js
    思路：跳过不必要处理的css，在处理规则时，跳过{}
 */

let nameReg = /^(?:\\.|[\w\-\u00c0-\uFFFF])+/;
//modified version of https://github.com/jquery/sizzle/blob/master/src/sizzle.js#L87
let attrReg = /^\s*((?:\\.|[\w\u00c0-\uFFFF\-])+)\s*(?:(\S?)=\s*(?:(['"])(.*?)\3|(#?(?:\\.|[\w\u00c0-\uFFFF\-])*)|)|)\s*(i)?\]/;
let isWhitespace = (c) => {
    return c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\r';
};
let atRuleSearchContent = {
    document: 1,
    supports: 1,
    media: 1
};
let atRuleIgnoreContent = {
    page: 1,
    '-webkit-keyframes': 1,
    '-moz-keyframes': 1,
    '-ms-keyframes': 1,
    '-o-keyframes': 1,
    keyframes: 1,
    'font-face': 1,
    viewport: 1,
    'counter-style': 1,
    'font-feature-values': 1
};
let unpackPseudos = {
    has: 1,
    not: 1,
    matches: 1
};
let quotes = {
    '"': 1,
    '\'': 1
};
let ignoreTags = {
    html: 1,
    body: 1
};
let parse = (css, file) => {
    let tokens = [];
    let nests = [];
    let nestsLocker = {};
    let current = 0;
    let max = css.length;
    let c;
    let stripWhitespaceAndGo = (offset) => {
        while (isWhitespace(css.charAt(current))) current++;
        current += offset;
    };
    let getArround = () => {
        //let start = Math.max(0, current - 10);
        let end = Math.min(css.length, current + 40);
        return css.substring(current - 1, end);
    };
    let getNameAndGo = () => {
        let sub = css.substr(current);
        let id;
        let matches = sub.match(nameReg);
        if (matches) {
            id = matches[0];
            current += id.length;
        } else {
            throw {
                message: 'css-parser:get name error',
                file: file,
                extract: getArround()
            };
        }
        return id;
    };
    let skipAtRule = () => {
        //let sc = current;
        do {
            let tc = css.charAt(current);
            if (tc == ';' || tc == '\r' || tc == '\n' || tc == '{') {
                current++;
                break;
            }
            current++;
        } while (current < max);
        //let ec = current;
        //console.log('ignore at rule', css.substring(sc, ec));
    };
    let skipAtRuleUntilLeftBrace = () => {
        //let sc = current;
        do {
            let tc = css.charAt(current);
            if (tc == '{') {
                current++;
                break;
            }
            current++;
        } while (current < max);
        //let ec = current;
        //console.log('ignore at rule expr', css.substring(sc, ec));
    };
    let skipAtRuleContent = () => {
        let count = 0;
        //let sc = current;
        current = css.indexOf('{', current);
        while (current >= 0 && current < max) {
            let tc = css.charAt(current);
            if (tc == '{') {
                count++;
            } else if (tc == '}') {
                count--;
                if (!count) {
                    current++;
                    break;
                }
            }
            current++;
        }
        //let ec = current;
        //console.log('ignore content', css.substring(sc, ec));
    };
    let selector = '';
    let overSelectors = 0;
    let takeSelector = () => {
        if (overSelectors > 0) {
            if (overSelectors != 1 && //标签
                overSelectors != 11 && //input[type=text]
                overSelectors != 100 && // .input
                overSelectors != 200 // .focus .input 2个类
            ) {
                let s = selector.trim();
                if (!nestsLocker[s]) {
                    let temp = s.split('.'); //忽略label.disable
                    if (temp.length == 2 &&
                        temp[0].trim() == temp[0] &&
                        temp[1].trim() == temp[1] &&
                        nameReg.test(temp[0]) &&
                        nameReg.test(temp[1])) {
                        return;
                    }
                    nestsLocker[s] = 1;
                    nests.push(s);
                }
            }
        }
    };
    let processRules = () => {
        let prev = '';
        selector = '';
        overSelectors = 0;
        while (current < max) {
            let sc = current;
            stripWhitespaceAndGo(0);
            selector += css.substring(sc, current);
            let tc = css.charAt(current);
            if (tc == '@') {
                break;
            } else if (tc == ',' || tc == ')') {
                prev = '';
                takeSelector();
                selector = '';
                overSelectors = 0;
                current++;
            } else if (tc == '{') {
                current++;
                let ti = css.indexOf('}', current);
                if (ti != -1) {
                    current = ti;
                } else {
                    throw {
                        message: 'css-parser:missing right brace',
                        file: file,
                        extract: getArround()
                    };
                }
            } else if (tc == '}') {
                takeSelector();
                current++;
                break;
            } else if (tc === '.' || tc === '#') {
                current++;
                let sc = current;
                let id = getNameAndGo();
                selector += tc + id;
                overSelectors += tc === '.' ? 100 : 1000;
                if (tc == '.') {
                    tokens.push({
                        type: prev = 'class',
                        name: id,
                        start: sc,
                        end: current
                    });
                } else if (tc == '#') {
                    tokens.push({
                        type: prev = 'id',
                        name: id,
                        start: sc,
                        end: current
                    });
                }
            } else if (tc === '[') {
                current++;
                let temp = css.substr(current);
                let matches = temp.match(attrReg);
                if (!matches) {
                    throw {
                        message: 'css-parser:bad attribute',
                        file: file,
                        extract: getArround()
                    };
                }
                if (!prev) {
                    tokens.push({
                        type: 'sattr',
                        name: matches[1],
                        start: current,
                        end: current + matches[0].length
                    });
                }
                overSelectors += 10;
                prev = 'attr';
                selector += '[' + matches[0];
                current += matches[0].length;
            } else if (tc === ':') {
                if (css.charAt(current + 1) === ':') {
                    current += 2;
                    let id = getNameAndGo();

                    selector += '::' + id;
                    continue;
                }
                current++;
                let id = getNameAndGo();
                selector += ':' + id;
                if (css.charAt(current) === '(') {
                    if (id in unpackPseudos) {
                        let quot = css.charAt(current + 1);
                        let quoted = quot in quotes;
                        current += quoted + 1;
                        prev = '';
                        takeSelector();
                        overSelectors = 0;
                        selector = '';
                    } else {
                        let ti = css.indexOf(')', current);
                        if (ti > -1) {
                            selector += css.substring(current, ti + 2);
                            current = ti + 2;
                        }
                    }
                }
            } else if (nameReg.test(css.substr(current))) {
                let sc = current;
                let id = getNameAndGo();
                tokens.push({
                    type: prev = 'tag',
                    name: id,
                    start: sc,
                    end: current
                });
                if (!ignoreTags[id]) {
                    overSelectors++;
                }
                selector += id;
            } else {
                current++;
            }
        }
    };
    while (current < max) {
        stripWhitespaceAndGo(0);
        c = css.charAt(current);
        if (c === '@') {
            let start = current;
            current++;
            let name = getNameAndGo();
            if (atRuleSearchContent.hasOwnProperty(name)) {
                skipAtRuleUntilLeftBrace();
                processRules();
            } else if (atRuleIgnoreContent.hasOwnProperty(name)) {
                skipAtRuleContent();
            } else {
                skipAtRule();
                if (name == 'import') {
                    nests.push(css.slice(start, current));
                }
            }
        } else {
            processRules();
        }
    }
    return {
        tokens,
        nests
    };
};
module.exports = parse;