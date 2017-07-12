let slog = require('./util-log');
let fcache = require('./util-fcache');
let tmplCmd = require('./tmpl-cmd');
let tmplUnescape = require('./tmpl-unescape');
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
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
//检测各种可能执行代码的情况
let dangerousUriReg = /\b([a-z]+)\s*=\s*['"]?([^>]+)/gi;
let dnagerousAttrReg = /\b(on[a-z]+)\s*=[^>]+/gi;
//移除不必要的空白
let trimSpaceCharReg = /[\x01-\x20]/g;
let scriptProtocalReg = /^(?:javascript:|data:text\/)/i;
//允许href="javascript:;"写法
let uncheckReg = /^javascript:\s*;?['"]?\s+/g;

let jsProtocalWithHrefReg = /\bhref\s*=\s*(['"]?)javascript:[\s\S]+?\1/g;

let targetSelfReg = /\btarget\s*=\s*(['"])_self\1/g;
let allowClickReg = /onclick\s*=\s*(['"])return\s+false;*\1/;
/*
    xss
    十六进制　&#x20;
    十进制  &#20;
    空白符　1-32
 */
module.exports = {
    checkTag(e, tagName, match, refTmplCommands) {
        let tn = tagName.toLowerCase();
        if (tn == 'a') {
            if (targetSelfReg.test(match)) {
                let newMatch = tmplCmd.recover(match, refTmplCommands);
                slog.ever('remove unnecessary target="_self"'.red, 'at', e.shortHTMLFile.gray, 'in', newMatch);
            }
            let m = match.match(jsProtocalWithHrefReg);
            if (m) {
                let newMatch = tmplCmd.recover(match, refTmplCommands);
                slog.ever(('avoid use ' + m[0]).red, 'at', e.shortHTMLFile.gray, 'in', newMatch, 'more info:', 'http://www.360doc.com/content/16/0427/18/32095775_554304106.shtml'.magenta);
            }
        }
        if (tn == 'a' || tn == 'area') {
            newWindowReg.lastIndex = 0;
            safedReg.lastIndex = 0;
            if (newWindowReg.test(match) && !safedReg.test(match)) {
                let newMatch = tmplCmd.recover(match, refTmplCommands);
                slog.ever(('add rel="noopener noreferrer" to ' + newMatch).red, 'at', e.shortHTMLFile.gray, 'more info:', 'https://github.com/asciidoctor/asciidoctor/issues/2071'.magenta);
            }
        } else if (tn == 'style' || tn == 'script' || tn == 'link') {
            let newMatch = tmplCmd.recover(match, refTmplCommands);
            slog.ever(('remove tag ' + newMatch).red, 'at', e.shortHTMLFile.gray, (tn == 'style') ? ('use' + ' Magix.applyStyle'.red + ' instead') : '');
        }

        match.replace(dnagerousAttrReg, (m, attr) => {
            allowClickReg.lastIndex = 0;
            if (allowClickReg.test(m)) return;
            m = tmplCmd.recover(m, refTmplCommands);
            slog.ever(('remove dnagerous attr ' + attr).red, 'at', e.shortHTMLFile.gray, 'near', m.magenta);
        });

        match.replace(dangerousUriReg, (m, attr, content) => {
            if (uncheckReg.test(content)) {
                return;
            }
            content = tmplUnescape
                .unescape(content)
                .replace(trimSpaceCharReg, '')
                .toLowerCase();
            if (scriptProtocalReg.test(content)) {
                content = content.replace(scriptProtocalReg, '');
                m = tmplCmd.recover(m, refTmplCommands);
                slog.ever(('remove dnagerous attr ' + attr).red, 'at', e.shortHTMLFile.gray, 'near', m.magenta, ' Put your code to ' + e.shortFrom);
            }
        });

        return match;
    },
    checkMxEventName(eventName, e) {
        if (upperCaseReg.test(eventName)) {
            eventName = 'mx-' + eventName;
            upperCaseReg.lastIndex = 0;
            slog.ever(('avoid use ' + eventName).red, 'at', e.shortHTMLFile.gray, 'use', eventName.toLowerCase().red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
        }
    },
    checkMxEvengSingQuote(single, match, e) {
        if (single) {
            slog.ever(('avoid use single quote:' + match).red, 'at', e.shortHTMLFile.gray, 'use double quote instead');
        }
    },
    checkMxEventParams(eventName, params, match, e) {
        if (params.charAt(0) != '{' || params.charAt(params.length - 1) != '}') {
            slog.ever(('not recommended event params:' + match).magenta, 'at', e.shortHTMLFile.gray, 'replace it like', ('mx-' + eventName + '="({p1:\'p1\',p2:\'p2\'})"').magenta);
        }
    },
    checkMxEventParamsCMD(operate, match, content, mxEvent, e) {
        if (operate == '!') {
            match = match.replace(removeTempReg, '');
            let nc = content.replace(removeTempReg, '');
            slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.magenta, 'use', ('<%=' + nc + '%>').red, 'instead');
        } else if (operate == '@') {
            match = match.replace(removeTempReg, '');
            slog.ever(('unsupport ' + match).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.magenta);
        }
    },
    checkMxViewParams(paramName, e) {
        if (upperCaseReg.test(paramName)) {
            upperCaseReg.lastIndex = 0;
            let hname = hyphenate(paramName);
            slog.ever(('avoid use view-' + paramName).red, 'at', e.shortHTMLFile.gray, 'use', ('view-' + hname).red, 'instead', 'more info:', 'https://github.com/thx/magix/issues/35'.magenta);
            paramName = hname;
        }
        paramName = camelize(paramName);
        return paramName;
    },
    checkMxViewParamsEscape(operate, content, match, view, e) {
        if (operate === '!') {
            match = match.replace(removeTempReg, '');
            let nc = content.replace(removeTempReg, '');
            slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'near', ('mx-view="' + view + '"').magenta, 'use', ('<%=' + nc + '%>').red, 'or', ('<%@' + nc + '%>').red, 'instead');
        }
    }
};