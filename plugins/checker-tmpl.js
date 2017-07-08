let slog = require('./util-log');
let fcache = require('./util-fcache');
let tmplCmd = require('./tmpl-cmd');
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
let safedReg = /\brel\s*=\s*(["'])[^'"]*?noopener[^'"]*?\1/i;
let newWindowReg = /\btarget\s*=\s*(['"])[^'"]+\1/i;
let removeTempReg = /[\u0002\u0001\u0003\u0006]\.?/g;
module.exports = {
    checkLinkTag(e, tagName, match, refTmplCommands) {
        let tn = tagName.toLowerCase();
        if (tn == 'a' || tn == 'area') {
            newWindowReg.lastIndex = 0;
            safedReg.lastIndex = 0;
            if (newWindowReg.test(match) && !safedReg.test(match)) {
                let newMatch = tmplCmd.recover(match, refTmplCommands);
                slog.ever(('add rel="noopener noreferrer" to ' + newMatch).red, 'at', e.shortHTMLFile.gray, 'more info:', 'https://github.com/asciidoctor/asciidoctor/issues/2071'.magenta);
            }
        }
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
    checkMxEventParamsUnescape(operate, match, content, mxEvent, e) {
        if (operate == '!') {
            match = match.replace(removeTempReg, '');
            let nc = content.replace(removeTempReg, '');
            slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'in', mxEvent.magenta, 'use', ('<%=' + nc + '%>').red, 'instead');
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
        if (operate === '=') {
            match = match.replace(removeTempReg, '');
            let nc = content.replace(removeTempReg, '');
            slog.ever(('avoid use ' + match).red, 'at', e.shortHTMLFile.gray, 'near', ('mx-view="' + view + '"').magenta, 'use', ('<%!' + nc + '%>').red, 'or', ('<%@' + nc + '%>').red, 'instead');
        }
    }
};