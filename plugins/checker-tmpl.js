/*
    检测magix项目中，模板书写是否合法及可能产生问题的地方
 */
let slog = require('./util-log');
let fcache = require('./util-fcache');
let configs = require('./util-config');
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
let hyphenateRE = /([^-])([A-Z])/g;
let hyphenate = fcache(str => {
    return str
        .replace(hyphenateRE, '$1-$2')
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
        if (configs.checker.tmplAttrAnchor && (tn == 'a' || tn == 'area')) {
            if (targetSelfReg.test(match)) {
                slog.ever('remove unnecessary target="_self"'.red, 'at', e.shortHTMLFile.gray, 'in', newMatch);
            }
            let m = match.match(jsProtocalWithHrefReg);
            if (m) {
                let am = m[2].match(voidReg);
                if (am) {
                    slog.ever(('remove unnecessary ' + am[0]).red, 'at', e.shortHTMLFile.gray, 'in', newMatch);
                }
                if (!allowClickReg.test(match)) {
                    slog.ever(('avoid use ' + m[0]).red, 'at', e.shortHTMLFile.gray, 'in', newMatch, 'more info:', 'http://www.360doc.com/content/16/0427/18/32095775_554304106.shtml'.magenta);
                }
            }
            newWindowReg.lastIndex = 0;
            safedReg.lastIndex = 0;
            if (newWindowReg.test(match) && !safedReg.test(match)) {
                slog.ever(('add rel="noopener noreferrer" to ' + newMatch).red, 'at', e.shortHTMLFile.gray, 'more info:', 'https://github.com/asciidoctor/asciidoctor/issues/2071'.magenta);
            }
        } else if (configs.checker.tmplDisallowedTag && disallowedTags.hasOwnProperty(tn)) {
            slog.ever(('remove tag ' + newMatch).red, 'at', e.shortHTMLFile.gray, (tn == 'style') ? ('use' + ' Magix.applyStyle'.red + ' instead') : '');
        } else if (configs.checker.tmplAttrIframe && tn == 'iframe') {
            sandboxReg.lastIndex = 0;
            if (!sandboxReg.test(match)) {
                slog.ever(('add sandbox to ' + newMatch).red, 'at', e.shortHTMLFile.gray, 'more info:', 'http://www.w3school.com.cn/tags/att_iframe_sandbox.asp'.magenta);
            }
        }
        if (configs.checker.tmplAttrDangerous) {
            match.replace(dangerousAttrReg, (m, attr) => {
                allowClickReg.lastIndex = 0;
                if (allowClickReg.test(m)) return;
                slog.ever(('remove dnagerous attr ' + attr).red, 'at', e.shortHTMLFile.gray, 'near', m.magenta);
            });
        }

        return match;
    },
    checkMxEventName(eventName, e) {
        if (configs.checker.tmplAttrMxEvent && upperCaseReg.test(eventName)) {
            eventName = 'mx-' + eventName;
            upperCaseReg.lastIndex = 0;
            slog.ever(('avoid use ' + eventName).red, 'at', e.shortHTMLFile.gray, 'use', eventName.toLowerCase().red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
        }
    },
    checkMxEvengSingQuote(single, match, e) {
        if (configs.checker.tmplAttrMxEvent && single) {
            slog.ever(('avoid use single quote:' + match).red, 'at', e.shortHTMLFile.gray, 'use double quote instead');
        }
    },
    checkMxEventParams(eventName, params, match, e) {
        if (configs.checker.tmplAttrMxEvent) {
            if (params.charAt(0) != '{' || params.charAt(params.length - 1) != '}') {
                slog.ever(('not recommended event params:' + match).magenta, 'at', e.shortHTMLFile.gray, 'replace it like', ('mx-' + eventName + '="({p1:\'p1\',p2:\'p2\'})"').magenta);
            }
        }
    },
    checkMxEventParamsCMD(operate, match, content, mxEvent, e) {
        if (configs.checker.tmplAttrMxEvent) {
            if (operate == '!') {
                slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.magenta, 'use', ('<%=' + content + '%>').red, 'instead');
            } else if (operate == '@') {
                slog.ever(('unsupport ' + match).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.magenta);
            }
        }
    },
    checkMxViewParams(paramName, e) {
        if (configs.checker.tmplAttrMxView) {
            if (upperCaseReg.test(paramName)) {
                upperCaseReg.lastIndex = 0;
                let hname = hyphenate(paramName);
                slog.ever(('avoid use view-' + paramName).red, 'at', e.shortHTMLFile.gray, 'use', ('view-' + hname).red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
                paramName = hname;
            }
            paramName = camelize(paramName);
        }
        return paramName;
    },
    checkMxViewParamsEscape(operate, content, match, view, e) {
        if (configs.checker.tmplAttrMxView && operate === '!') {
            slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'near', ('mx-view="' + view + '"').magenta, 'use', ('<%=' + content + '%>').red, 'or', ('<%@' + content + '%>').red, 'instead');
        }
    }
};