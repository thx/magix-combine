/*
    http://www.w3school.com.cn/cssref/css_selectors.asp
    简易parser，只处理类与标签，其中
    processRules 参考了这个：https://github.com/fb55/css-what/blob/master/index.js
    思路：跳过不必要处理的css，在处理规则时，跳过{ }
 */
let cache = Object.create(null);
let nameReg = /^(?:\\.|[\w\-\u00c0-\uFFFF])+/;
//modified version of https://github.com/jquery/sizzle/blob/master/src/sizzle.js#L87
let attrReg = /^\s*((?:\\.|[\w\u00c0-\uFFFF\-])+)\s*(?:(\S?)=\s*(?:(['"])(.*?)\3|(#?(?:\\.|[\w\u00c0-\uFFFF\-])*)|)|)\s*(i)?\]/;
let isWhitespace = c => {
    return c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\r';
};
let nonEmptyReg = /^\S+$/;
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
    body: 1,
    tbody: 1,
    thead: 1,
    tfoot: 1,
    tr: 1,
    th: 1,
    td: 1,
    col: 1,
    caption: 1,
    colgroup: 1
};
let selectorPower = {
    TAG: 1,
    ATTR: 100,
    CLASS: 10000,
    ID: 1000000
};
let parse = (css, file) => {
    let tokens = [];
    let nests = [];
    let nestsLocker = Object.create(null);
    let current = 0;
    let max = css.length;
    let c;
    let stripWhitespaceAndGo = offset => {
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
    let overSelectors = 0,
        selectorStart = 0;
    let takeSelector = (offset) => {
        if (overSelectors > 0) { //1 标签　　100属性　10000类　1000000　id
            //debugger;
            if (!offset) offset = 0;
            let s = css.slice(selectorStart, current + offset).trim(); //
            if (nonEmptyReg.test(s)) { //无空格写法　如a.b.c  a[text][href] a.span.red
                if (overSelectors < 300) { //3*ATTR;
                    return;
                } else if (overSelectors > selectorPower.CLASS && overSelectors < 3 * selectorPower.CLASS) {
                    return;
                }
            }
            if (overSelectors <= 303) { //3*selectorPower.ATTR + 3*selectorPower.TAG
                overSelectors %= selectorPower.ATTR;
            } else if (overSelectors >= selectorPower.CLASS && overSelectors <= 20200) {
                //2*selectorPower.CLASS+2*selectorPower.ATTR
                overSelectors %= selectorPower.CLASS;
                overSelectors %= selectorPower.ATTR;
                if (overSelectors && overSelectors <= 3) { //类与标签混用
                    overSelectors = 4; //不建议混用
                }
            }
            if (overSelectors && overSelectors > 3 * selectorPower.TAG) {
                if (!nestsLocker[s]) {
                    nestsLocker[s] = 1;
                    nests.push(s);
                }
            }
        }
    };
    let processRules = () => {
        let prev = '',
            pseudos = [];
        overSelectors = 0;
        selectorStart = current;
        while (current < max) {
            stripWhitespaceAndGo(0);
            let tc = css.charAt(current);
            if (tc == '/') {
                current = css.indexOf('*/', current) + 2;
                break;
            } else if (tc == '@') {
                break;
            } else if (tc == ',') {
                prev = '';
                takeSelector();
                overSelectors = 0;
                current++;
                selectorStart = current;
            } else if (tc == '{') {
                takeSelector();
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
                current++;
                break;
            } else if (tc === '.' || tc === '#') {
                current++;
                let sc = current;
                let isGlobal = false;
                if (tc == '.') {
                    isGlobal = css.charAt(current) == '@';
                    if (isGlobal) {
                        current++;
                    }
                }
                let id = getNameAndGo();
                overSelectors += tc === '.' ? selectorPower.CLASS : selectorPower.ID;
                if (tc == '.') {
                    tokens.push({
                        type: prev = 'class',
                        name: id,
                        start: sc,
                        end: current,
                        isGlobal
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
                overSelectors += selectorPower.ATTR;
                prev = 'attr';
                current += matches[0].length;
            } else if (tc === ':') {
                if (css.charAt(current + 1) === ':') {
                    current += 2;
                    getNameAndGo();
                    continue;
                }
                current++;
                let id = getNameAndGo();
                if (css.charAt(current) === '(') {
                    //debugger;
                    if (unpackPseudos.hasOwnProperty(id)) {
                        let quot = css.charAt(current + 1);
                        let quoted = quot in quotes;
                        current += quoted + 1;
                        pseudos.push({
                            quoted,
                            selectorStart,
                            overSelectors
                        });
                        prev = '';
                        selectorStart = current;
                    } else {
                        let ti = css.indexOf(')', current);
                        if (ti > -1) {
                            current = ti + 1;
                        }
                    }
                }
            } else if (tc == ')') {
                current++;
                if (pseudos.length) {
                    let last = pseudos.pop();
                    takeSelector(last.quoted ? -2 : -1);
                    overSelectors = last.overSelectors;
                    selectorStart = last.selectorStart;
                    takeSelector();
                } else {
                    prev = '';
                    selectorStart = current;
                    overSelectors = 0;
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
                    overSelectors += selectorPower.TAG;
                }
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
                    nests.push(css.slice(start, current - 1));
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
module.exports = (css, file) => {
    let key = file + '@' + css;
    if (cache[key]) {
        return cache[key];
    }
    return (cache[key] = parse(css, file));
};