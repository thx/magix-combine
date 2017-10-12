/*
    检测magix项目中，模板书写是否合法及可能产生问题的地方
 */
let chalk = require('chalk');
let slog = require('./util-log');
let fcache = require('./util-fcache');
/**
 * Camelize a hyphen-delimited string.
 */
let camelizeRE = /-(\w)/g;
let camelize = fcache(str => {
    return str.replace(camelizeRE, (_, c) => {
        return c ? c.toUpperCase() : '';
    });
});

/**
 * Hyphenate a camelCase string.
 */
let upperCaseReg = /[A-Z]/g;
let hyphenateRE = /(?=[^-])([A-Z])/g;
let hyphenate = fcache(str => {
    return str
        .replace(hyphenateRE, '-$1')
        .toLowerCase();
});
//是否添加了noopener
let safedReg = /\brel\s*=\s*(["'])[^'"]*?noopener[^'"]*?\1/i;
//新窗口打开，对于target="_self"这种写法是多余的
let newWindowReg = /\btarget\s*=\s*(['"])[^'"]+\1/i;
//检测各种可能执行代码的情况
let dangerousAttrReg = /\b(on[a-z]+)\s*=\s*(['"]?)[^>]+?\2/gi;

let jsProtocalWithHrefReg = /\bhref\s*=\s*(['"]?)javascript:([\s\S]+?)\1/i;

let targetSelfReg = /\btarget\s*=\s*(['"])_self\1/g;
let allowClickReg = /\bonclick\s*=\s*(['"])return\s+false;*\1/;
let voidReg = /void\([\s\S]+?\);?/;
let sandboxReg = /\bsandbox\s*=\s*(["'])[^'"]*?\1/;
let disallowedTags = {
    script: 1,
    style: 1,
    link: 1,
    meta: 1,
    base: 1,
    basefont: 1,
    title: 1,
    html: 1,
    body: 1
};
/*
    xss
    十六进制　&#x20;
    十进制  &#20;
    空白符　1-32
 */
module.exports = {
    checkTag(e, tagName, match, toSrc) {
        let tn = tagName.toLowerCase();
        let newMatch = toSrc(match);
        if (e.checker.tmplAttrAnchor && (tn == 'a' || tn == 'area')) {
            if (targetSelfReg.test(match)) {
                slog.ever(chalk.red('remove unnecessary target="_self"'), 'at', chalk.grey(e.shortHTMLFile), 'in', newMatch);
            }
            let m = match.match(jsProtocalWithHrefReg);
            if (m) {
                let am = m[2].match(voidReg);
                if (am) {
                    slog.ever(chalk.red('remove unnecessary ' + am[0]), 'at', chalk.grey(e.shortHTMLFile), 'in', newMatch);
                }
                if (!allowClickReg.test(match)) {
                    slog.ever(chalk.red('avoid use ' + m[0]), 'at', chalk.grey(e.shortHTMLFile), 'in', newMatch, 'more info:', chalk.magenta('http://www.360doc.com/content/16/0427/18/32095775_554304106.shtml'));
                }
            }
            newWindowReg.lastIndex = 0;
            safedReg.lastIndex = 0;
            if (newWindowReg.test(match) && !safedReg.test(match)) {
                slog.ever(chalk.red('add rel="noopener noreferrer" to ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), 'more info:', chalk.magenta('https://github.com/asciidoctor/asciidoctor/issues/2071'));
            }
        } else if (e.checker.tmplDisallowedTag && disallowedTags.hasOwnProperty(tn)) {
            slog.ever(chalk.red('remove tag ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), (tn == 'style') ? ('use' + chalk.red(' Magix.applyStyle') + ' instead') : '');
        } else if (e.checker.tmplAttrIframe && tn == 'iframe') {
            sandboxReg.lastIndex = 0;
            if (!sandboxReg.test(match)) {
                slog.ever(chalk.red('add sandbox to ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), 'more info:', chalk.magenta('http://www.w3school.com.cn/tags/att_iframe_sandbox.asp'));
            }
        }
        if (e.checker.tmplAttrDangerous) {
            match.replace(dangerousAttrReg, (m, attr) => {
                allowClickReg.lastIndex = 0;
                if (allowClickReg.test(m)) return;
                slog.ever(chalk.red('remove dnagerous attr ' + attr), 'at', chalk.grey(e.shortHTMLFile), 'near', chalk.magenta(m));
            });
        }

        return match;
    },
    checkMxEventName(eventName, e) {
        if (e.checker.tmplAttrMxEvent && upperCaseReg.test(eventName)) {
            eventName = 'mx-' + eventName;
            upperCaseReg.lastIndex = 0;
            slog.ever(chalk.red('avoid use ' + eventName), 'at', chalk.grey(e.shortHTMLFile), 'use', chalk.red(eventName.toLowerCase()), 'instead', 'more info:', chalk.magenta('https://github.com/thx/magix/issues/35'));
        }
    },
    checkMxEvengSingQuote(single, match, e) {
        if (e.checker.tmplAttrMxEvent && single) {
            slog.ever(chalk.red('avoid use single quote:' + match), 'at', chalk.grey(e.shortHTMLFile), 'use double quote instead');
        }
    },
    checkMxEventParams(eventName, params, match, e) {
        if (e.checker.tmplAttrMxEvent) {
            if (params.charAt(0) != '{' || params.charAt(params.length - 1) != '}') {
                slog.ever(chalk.magenta('not recommended event params:' + match), 'at', chalk.grey(e.shortHTMLFile), 'replace it like', chalk.magenta('mx-' + eventName + '="({p1:\'p1\',p2:\'p2\'})"'));
            }
        }
    },
    checkMxEventParamsCMD(operate, match, content, mxEvent, e, srcStr) {
        if (e.checker.tmplAttrMxEvent) {
            if (operate == '!') {
                slog.ever(chalk.red('avoid use ' + match), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent), 'use', chalk.red('<%=' + content + '%>'), 'instead');
            } else if (operate == '@') {
                slog.ever(chalk.red('unsupport ' + match), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent), 'near', chalk.magenta(srcStr));
            }
        }
    },
    checkMxViewParams(paramName, e) {
        let hname = hyphenate(paramName);
        if (e.checker.tmplAttrMxView) {
            upperCaseReg.lastIndex = 0;
            if (upperCaseReg.test(paramName)) {
                slog.ever(chalk.red('avoid use view-' + paramName), 'at', chalk.grey(e.shortHTMLFile), 'use', chalk.red('view-' + hname), 'instead', 'more info:', chalk.magenta('https://github.com/thx/magix/issues/35'));
            }
        }
        paramName = hname;
        paramName = camelize(paramName);
        return paramName;
    },
    checkMxViewParamsEscape(operate, content, match, view, e) {
        if (e.checker.tmplAttrMxView && operate === '!') {
            slog.ever(chalk.red('avoid use ' + match), 'at', chalk.grey(e.shortHTMLFile), 'near', chalk.magenta('mx-view="' + view + '"'), 'use', chalk.red('<%=' + content + '%>'), 'or', chalk.red('<%@' + content + '%>'), 'instead');
        }
    }
};