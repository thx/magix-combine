/*
    检测magix项目中，模板书写是否合法及可能产生问题的地方
 */
let chalk = require('chalk');
let slog = require('./util-log');
let fcache = require('./util-fcache');
let tmplCmd = require('./tmpl-cmd');
let htmlParser = require('./html-parser');
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
let hyphenateRE = /(?=[^-])([A-Z])/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/;
let hyphenate = fcache(str => {
    return str
        .replace(hyphenateRE, '-$1')
        .toLowerCase();
});
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
    checkTag(e, match, toSrc) {
        if (!configs.debug) return match;
        let tagInfo = htmlParser.parseStartTag(match);
        let tagName = tagInfo.tagName;
        let attrsMap = tagInfo.attrsMap;
        let tn = tagName.toLowerCase();
        let newMatch = toSrc(match);
        if (e.checker.tmplAttrAnchor && (tn == 'a' || tn == 'area')) {
            if (attrsMap.target == '_self') {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('remove unnecessary target="_self"'), 'at', chalk.grey(e.shortHTMLFile), 'in', newMatch);
            } else if (attrsMap.target &&
                (!attrsMap.rel ||
                    attrsMap.rel.indexOf('noopener') === -1)) {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('add rel="noopener noreferrer" to ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), 'more info:', chalk.magenta('https://github.com/asciidoctor/asciidoctor/issues/2071'));
            }
        } else if (e.checker.tmplDisallowedTag && disallowedTags.hasOwnProperty(tn)) {
            slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('remove tag ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), (tn == 'style') ? ('use' + chalk.red(' Magix.applyStyle') + ' instead') : '');
        } else if (e.checker.tmplAttrIframe && tn == 'iframe') {
            if (!attrsMap.sandbox) {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('add sandbox to ' + newMatch), 'at', chalk.grey(e.shortHTMLFile), 'more info:', chalk.magenta('http://www.w3school.com.cn/tags/att_iframe_sandbox.asp'));
            }
        }
        if (e.checker.tmplAttrDangerous) {
            for (let a of tagInfo.attrs) {
                if (a[1].startsWith('on')) {
                    slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('remove dnagerous attr ' + a[1]), 'at', chalk.grey(e.shortHTMLFile), 'near', newMatch);
                }
            }
        }

        return match;
    },
    checkMxEventName(eventName, e) {
        if (!configs.debug) return;
        upperCaseReg.lastIndex = 0;
        if (e.checker.tmplAttrMxEvent && upperCaseReg.test(eventName)) {
            eventName = 'mx-' + eventName;
            slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('avoid use ' + eventName), 'at', chalk.grey(e.shortHTMLFile), 'use', chalk.red(eventName.toLowerCase()), 'instead', 'more info:', chalk.magenta('https://github.com/thx/magix/issues/35'));
        }
    },
    checkMxEvengSingQuote(single, match, e) {
        if (!configs.debug) return;
        if (e.checker.tmplAttrMxEvent && single) {
            slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('avoid use single quote:' + match), 'at', chalk.grey(e.shortHTMLFile), 'use double quote instead');
        }
    },
    checkMxEventParams(eventName, params, match, e) {
        if (!configs.debug) return;
        if (e.checker.tmplAttrMxEvent) {
            if (params.charAt(0) != '{' || params.charAt(params.length - 1) != '}') {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.magenta('not recommended event params:' + match), 'at', chalk.grey(e.shortHTMLFile), 'replace it like', chalk.magenta('mx-' + eventName + '="({p1:\'p1\',p2:\'p2\'})"'));
            }
        }
    },
    checkMxEventParamsCMD(operate, mxEvent, e, srcStr) {
        if (!configs.debug) return;
        if (e.checker.tmplAttrMxEvent) {
            let i = tmplCmd.extactCmd(srcStr, ['!', '@']);
            if (operate == '!') {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('avoid use ' + i.match), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent), 'use', chalk.red(i.match.replace(open + '!', open + '=')), 'instead');
            } else if (operate == '@') {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('unsupport ' + i.match), 'at', chalk.grey(e.shortHTMLFile), 'in', chalk.magenta(mxEvent), 'near', chalk.magenta(srcStr));
            }
        }
    },
    checkMxViewParams(paramName, e, prefix = 'view-') {
        let hname = hyphenate(paramName);
        if (e.checker.tmplAttrMxView && configs.debug) {
            upperCaseReg.lastIndex = 0;
            if (upperCaseReg.test(paramName)) {
                slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('avoid use ' + prefix + paramName + ' or ' + paramName), 'at', chalk.grey(e.shortHTMLFile), 'use', chalk.red(prefix + hname + ' or ' + hname), 'instead', 'more info:', chalk.magenta('https://github.com/thx/magix/issues/35'));
            }
        }
        paramName = hname;
        paramName = camelize(paramName);
        return paramName;
    },
    checkAtAttr(expr, e) {
        if (!configs.debug) return;
        slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('unsupport ' + expr), 'at', chalk.grey(e.shortHTMLFile));
    },
    checkMxViewParamsEscape(operate, match, view, e) {
        if (!configs.debug) return;
        if (e.checker.tmplAttrMxView && operate === '!') {
            let i = tmplCmd.extactCmd(match, ['!']);
            slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('avoid use ' + i.match), 'at', chalk.grey(e.shortHTMLFile), 'near', chalk.magenta('mx-view="' + view + '"'), 'use', chalk.red(`${i.open}=${i.content}${i.close}`), 'or', chalk.red(`${i.open}@${i.content}${i.close}`), 'instead');
        }
    },
    checkStringRevisable(content, match, e) {
        if (!configs.debug) return;
        if (tmplCommandAnchorReg.test(content)) {
            slog.ever(chalk.magenta('[MXC Tip(checker-tmpl)]'), chalk.red('unsupport ' + match), 'at', chalk.grey(e.shortHTMLFile));
        }
    }
};