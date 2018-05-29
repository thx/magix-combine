/*
<div each="{{list as user index}}" if="{{user.age>20}}">
    <input value="{{:user.name}}"/>
    <input type="checkbox" @checked="{{=user.gender=='female'}}"/>
    {{=user.age}}
    {{if user.age>30}}
        <span>~~~</span>
    {{/if}}
    {{=user.origin}}
    <div mx-view="path/to/user/card" user="{{@user}}">
        <mx-loading/>
    </div>
</div>
*/
let HTMLParser = require('html-minifier/src/htmlparser').HTMLParser;
let tmplCmd = require('./tmpl-cmd');
let configs = require('./util-config');
let artExpr = require('./tmpl-art-ctrl');
let consts = require('./util-const');
let utils = require('./util');
let util = require('util');
let regexp = require('./util-rcache');
let slog = require('./util-log');
let attrMap = require('./tmpl-attr-map');
let chalk = require('chalk');
let viewIdReg = /\x1f/g;
let tmplCmdReg = /<%([@=!\x1a\x1c\x1d])?([\s\S]*?)%>/g;
let closeReg = /\);?\s*$/;
let artCtrlReg = /(?:<%'(\d+)\x11([^\x11]+)\x11'%>)?<%([@=!:~&])?([\s\S]+?)%>/g;
let inReg = /\(([\s\S]+?)\s*,\s*([^),]+)\)\s*in\s+(\S+)/;
let mathcer = /<%([@=!\x1a\x1c\x1d])?([\s\S]*?)%>|$/g;
let escapeSlashRegExp = /\\|'/g;
let escapeBreakReturnRegExp = /\r|\n/g;
let suffixReg = /\+'';\s*/g;
let endReg = /;\s*$/;
let condPlus = /\+''\+/g;
let declareReg = /^(?:let|const|var)\s+/;
let loopReg = /\b(each|forin)\s*=\s*(['"])([^'"]+)\2/g;
let ifReg = /\b(if|elif|for)\s*=\s*(['"])([^'"]+)\2/g;
let tagHReg = /\x03\d+\x03/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let ifExtractReg = /^(?:for|if)\(([\s\S]+?)\);?\s*$/;
let commaExprReg = /(?:,''\)|(%>'));/g;
let directReg = /\{\{&[\s\S]+?\}\}/g;

let matchedTagReg = /(<([^>\s\/]+)[^>]*>)([^<>]*?)(<\/\2>)/g;
let tagReg = /<(\/?)[^>]+>/g;
let storeMatchedTags = (tmpl, store) => {
    let idx = store.___idx || 0;
    return tmpl.replace(matchedTagReg, (m, prefix, tag, content, suffix) => {
        let groups = [prefix, content, suffix];
        let returned = '';
        for (let g of groups) {
            let key = '\x03' + idx++ + '\x03';
            store[key] = {
                tag: g == prefix,
                src: g
            };
            returned += key;
        }
        store.___idx = idx;
        return returned;
    });
};
let storeHTML = (tmpl, store) => {
    let idx = store.___idx || 0;
    return tmpl.replace(tagReg, (m, closed) => {
        let key = '\x03' + idx++ + '\x03';
        store[key] = {
            tag: closed ? false : true,
            src: m
        };
        store.___idx = idx;
        return key;
    });
};
let extractArtAndCtrlFrom = tmpl => {
    let result = [];
    tmpl.replace(artCtrlReg, (match, line, art, operate, ctrl) => {
        result.push({
            origin: match,
            line,
            operate,
            art,
            ctrl
        });
    });
    return result;
};
let toFn = (key, tmpl, fromAttr, e) => {
    let index = 0,
        hasCtrl = false,
        hasOut = false,
        source = `${key}='`,
        snippet,
        preArt = -1,
        ctrlCount = 0,
        hasSnippet = false,
        setStart = false,
        reg = regexp.get(`${regexp.escape(key)}\\+='';+`, 'g');
    tmpl.replace(mathcer, (match, operate, content, offset) => {
        snippet = tmpl.substring(index, offset)
            .replace(escapeSlashRegExp, `\\$&`)
            .replace(escapeBreakReturnRegExp, `\\n`);
        if (snippet) {
            hasSnippet = hasSnippet || !content || !setStart;
            hasOut = true;
            if (preArt == index) {
                source += `'')+'`;
            }
        }
        setStart = true;
        source += snippet;
        index = offset + match.length;
        let ctrl = tmpl.substring(index - match.length + 2 + (operate ? 1 : 0), index - 2);
        let artReg = /^'(\d+)\x11([^\x11]+)\x11'$/;
        let artMatch = ctrl.match(artReg);
        let art = '', line = -1;
        ctrl = ctrl.replace(escapeSlashRegExp, `\\$&`).replace(escapeBreakReturnRegExp, `\\n`);
        if (artMatch) {
            ctrl = '';
            art = artMatch[2];
            line = artMatch[1];
        }
        if (operate == '@' || operate == '\x1d') {
            hasOut = true;
            let out = operate == '@' ? `$i($$,${content})` : `(($_temp=${content})?$i($$,$_temp):null)`;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%@${ctrl}%>',${out})+'`;
                } else {
                    source += `'+($__ctrl='<%@${ctrl}%>',${out})+'`;
                }
            } else {
                source += `'+${out}+'`;
            }
        } else if (operate == '=' || operate == '\x1a') {
            hasOut = true;
            let out = operate == '=' ? `$e(${content})` : `(($_temp=${content})?$e($_temp):null)`;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%=${ctrl}%>',${out})+'`;
                } else {
                    source += `'+($__ctrl='<%=${ctrl}%>',${out})+'`;
                }
            } else {
                source += `'+${out}+'`;
            }
        } else if (operate == '!' || operate == '\x1c') {
            if (!content.startsWith('$eu(') || !content.endsWith(')')) {
                slog.ever(chalk.red(`unsupport {{!${content}}}`), 'file', chalk.grey(e.shortHTMLFile));
                throw new Error('unsupport {{!' + content + '}}' + ' at file:' + e.shortHTMLFile);
            }
            hasOut = true;
            let out = operate == '!' ? content : `(${content}||null)`;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%!${ctrl}%>',${out})+'`;
                } else {
                    source += `'+($__ctrl='<%!${ctrl}%>',${out})+'`;
                }
            } else {
                source += `'+${out}+'`;
            }
        } else if (content) {
            if (line > -1) {
                preArt = index;
                source += `'+($__line=${line},$__art='{{${art}}}',`;
            } else {
                ctrlCount++;
                if (preArt == offset) {
                    source += `'')+'`;
                }
                hasCtrl = true;
                source += `';`;
                if (configs.debug) {
                    source += `$__ctrl='<%${ctrl}%>';`;
                }
                source += `${content};${key}+='`;
            }
        }
        return match;
    });
    source += `';`;
    //console.log(source);
    source = source
        .replace(viewIdReg, `'+$viewId+'`)
        .replace(reg, '');
    reg = regexp.get(`^${regexp.escape(key)}=''\\+`);
    source = source
        .replace(reg, regexp.encode(key + '='))
        .replace(suffixReg, ';')
        .replace(condPlus, '+')
        .replace(endReg, '');
    //console.log(source, reg);
    //like '($__line=2,$__art=\'{{checked}}\',\'\');$__ctrl=\'<%$$.checked%>\';$$.checked' 
    if (configs.debug && fromAttr && !hasOut && ctrlCount == 1) {
        source = source.replace(commaExprReg, '$1,') + ')';
    }
    if (ctrlCount > 1 && !hasOut) {//如果超出1条控制语句，即使没有输出，也要认为有输出
        hasOut = true;
    }
    if (!hasOut || !hasCtrl) {
        reg = regexp.get(`^${regexp.escape(key)}=(?:'';+)?`);
        source = source.replace(reg, '');
    }
    return {
        source,
        hasOut,
        hasSnippet,
        hasCtrl
    };
};
let serAttrs = (key, value, fromAttr, e) => {
    if (value === true) {
        return {
            direct: true,
            returned: true
        };
    }
    let { source, hasCtrl, hasOut, hasSnippet } = toFn(key, value, fromAttr, e);
    if (hasCtrl && hasOut) {
        return {
            direct: false,
            returned: source,
            hasSnippet
        };
    } else {
        return {
            direct: true,
            returned: source
        };
    }
};
let extractDeclares = cnt => {
    let declares = [];
    cnt = cnt.replace(artCtrlReg, (match, line, art, operate, ctrl) => {
        ctrl = ctrl.trim();
        if (operate || !declareReg.test(ctrl)) {
            return match;
        }
        if (configs.debug) {
            declares.push(`$__line=${line};$__art='{{${art}}}';$__ctrl='${ctrl.replace(escapeSlashRegExp, '\\$&')}';`);
        }
        declares.push(ctrl + ';');
        return '';
    }).replace(tmplCmdReg, (m, o, c) => {
        c = c.trim();
        if (o || !declareReg.test(c)) {
            return m;
        }
        declares.push(c + ';');
        return '';
    });
    return {
        tmpl: cnt.trim(),
        declares
    };
};
let getForContent = (cnt, e) => {
    let fi = extractArtAndCtrlFrom(cnt);
    if (fi.length > 1 || fi.length < 1) {
        throw new Error('bad loop ' + cnt + ' at ' + e.shortHTMLFile);
    }
    fi = fi[0];
    let m = fi.ctrl.match(inReg);
    if (m) {
        return {
            art: fi.art,
            line: fi.line,
            value: m[1],
            list: m[3],
            key: m[2] || utils.uId('$q_key_', '', 1)
        };
    }
    throw new Error('bad loop ' + cnt + ' at ' + e.shortHTMLFile);
};
let getIfContent = (cnt, e) => {
    let fi = extractArtAndCtrlFrom(cnt);
    if (fi.length > 1 || fi.length < 1) {
        throw new Error('bad if ' + cnt + ' at ' + e.shortHTMLFile);
    }
    fi = fi[0];
    let m = fi.ctrl.match(ifExtractReg);
    if (m) {
        return {
            art: fi.art,
            line: fi.line,
            value: m[1]
        };
    }
    throw new Error('bad if ' + cnt + ' at ' + e.shortHTMLFile);
};
let parser = (tmpl, e) => {
    let cmds = Object.create(null);
    tmpl = tmplCmd.store(tmpl, cmds);
    let current = {
        children: []
    };
    let stack = [current];
    new HTMLParser(tmpl, {
        html5: true,
        start(tag, attrs, unary) {
            tag = tag.toLowerCase();
            let token = {
                tag,
                type: 1,
                ctrls: [],
                children: []
            };
            let aList = [],
                auto = false;
            for (let a of attrs) {
                if (a.name == '_code') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = extractArtAndCtrlFrom(t);
                    if (fi.length > 1 || fi.length < 1) {
                        throw new Error('bad direct tag ' + t + ' at ' + e.shortHTMLFile);
                    }
                    fi = fi[0];
                    token.directArt = fi.art;
                    token.directLine = fi.line;
                    token.directCtrl = fi.ctrl;
                } else if (a.name == '_mxo') {
                    auto = true;
                } else if (a.name == 'each' ||
                    a.name == 'forin') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getForContent(t, e);
                    token.ctrls.push({
                        type: a.name,
                        line: fi.line,
                        art: fi.art,
                        key: fi.key,
                        value: fi.value,
                        list: fi.list
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'if' ||
                    a.name == 'elif') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getIfContent(t, e);
                    token.ctrls.push({
                        type: a.name,
                        line: fi.line,
                        art: fi.art,
                        cond: fi.value
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'else') {
                    token.ctrls.push({
                        type: 'else'
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'for') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = extractArtAndCtrlFrom(t);
                    if (fi.length > 1 || fi.length < 1) {
                        throw new Error('bad for ' + t + ' at ' + e.shortHTMLFile);
                    }
                    fi = fi[0];
                    token.ctrls.push({
                        type: 'for',
                        line: fi.line,
                        art: fi.art,
                        cond: fi.ctrl.replace(ifExtractReg, '$1')
                    });
                    token.hasCtrls = true;
                } else if (a.name != 'loop_declare') {
                    aList.push(a);
                } else if (a.name == 'type' && a.quote && tag == 'input') {
                    token.inputType = a.value;
                }
            }
            token.attrs = aList;
            token.unary = unary;
            token.auto = auto;
            current.children.push(token);
            if (!unary) {
                stack.push(token);
                current = token;
            }
        },
        end() {
            stack.pop();
            current = stack[stack.length - 1];
        },
        chars(text) {
            current.children.push({
                type: 3,
                content: text
            });
        }
    });
    return {
        tokens: current.children,
        cmds,
        tmpl
    };
};
let Directives = {
    'if'(ctrl, start, end, auto) {
        if (configs.debug) {
            let art = `${auto ? '{{if ' : 'if="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify('if(' + ctrl.cond + '){')};`);
        }
        start.push(`if(${ctrl.cond}){`);
        end.push('}');
    },
    'elif'(ctrl, start, end, auto) {
        start.push(`else if(`);
        if (configs.debug) {
            let art = `${auto ? '{{else if ' : 'elif="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`(($__line=${ctrl.line},$__art=${JSON.stringify(art)},`);
            start.push(`$__ctrl=${JSON.stringify('else if(' + ctrl.cond + '){')}),`);
        }
        start.push(ctrl.cond);
        if (configs.debug) {
            start.push(')');
        }
        start.push(`{`);
        end.push('}');
    },
    'else'(ctrl, start, end) {
        start.push(`else{`);
        end.push('}');
    },
    'each'(ctrl, start, end, auto) {
        let shortList = utils.uId('$q_a_', '', 1);
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `let ${ctrl.value}=${shortList}[${ctrl.key}];`;
        if (configs.debug) {
            let art = `${auto ? '{{each ' : 'each="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(let ${ctrl.key}=0,${shortList}=${ctrl.list};${ctrl.key}<${shortList}.length;${ctrl.key}++){${initial}`)};`);
        }
        start.push(`for(let ${ctrl.key}=0,${shortList}=${ctrl.list};${ctrl.key}<${shortList}.length;${ctrl.key}++){${initial}`);
        end.push('}');
    },
    'forin'(ctrl, start, end, auto) {
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `{let ${ctrl.value}=${ctrl.list}[${ctrl.key}];`;
        if (configs.debug) {
            let art = `${auto ? '{{forin ' : 'forin="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(let ${ctrl.key} in ${ctrl.list}){${initial}`)};`);
        }
        start.push(`for(let ${ctrl.key} in ${ctrl.list}){${initial}`);
        end.push('}');
    },
    'for'(ctrl, start, end, auto) {
        if (configs.debug) {
            let art = `${auto ? '{{for ' : 'for="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(${ctrl.cond}){`)};`);
        }
        start.push(`for(${ctrl.cond}){`);
        end.push('}');
    }
};
let preProcess = (src, e) => {
    let cmds = Object.create(null),
        tags = Object.create(null);
    src = src.replace(directReg, m => {
        return `<direct _code="${m.replace(/"/g, '&quot;')}"/>`;
    });
    src = artExpr.addLine(src);
    src = tmplCmd.store(src, cmds);
    src = tmplCmd.store(src, cmds, consts.artCommandReg);
    src = storeMatchedTags(src, tags);
    src = src.replace(tmplCommandAnchorReg, m => {
        let ref = cmds[m];
        if (ref) {
            let i = artExpr.extractArtInfo(ref);
            if (i) {
                let { art, line, ctrls } = i;
                if (ctrls[0] == 'each') {
                    return `<group _mxo each="{{${line}${art.substring(5)}}}">`;
                } else if (ctrls[0] == 'forin') {
                    return `<group _mxo forin="{{${line}${art.substring(6)}}}">`;
                } else if (ctrls[0] == 'for') {
                    return `<group _mxo for="{{${line}${art.substring(4)}}}">`;
                } else if (ctrls[0] == 'if') {
                    return `<group _mxo if="{{${line}${art.substring(3)}}}">`;
                } else if (ctrls[0] == 'else') {
                    if (ctrls[1] == 'if') {
                        return `</group><group _mxo elif="{{${line}${art.substring(7)}}}">`;
                    }
                    return `</group><group _mxo else>`;
                } else if (art.startsWith('/each') ||
                    art.startsWith('/forin') ||
                    art.startsWith('/for') ||
                    art.startsWith('/if')) {
                    return '</group>';
                }
            } else {
                return m;
            }
        }
        return m;
    });

    src = tmplCmd.store(src, cmds, consts.artCommandReg);
    src = storeHTML(src, tags);
    src = src.replace(tagHReg, m => {
        m = tags[m];
        if (m.tag) {
            m = m.src;
            m = m.replace(loopReg, (_, k, $, c) => {
                c = tmplCmd.recover(c, cmds);
                let li = artExpr.extractArtInfo(c);
                if (li) {
                    let ctrls = li.art.split(/\s+/),
                        expr;
                    if (ctrls.length == 1) {
                        expr = {
                            vars: utils.uId('$q_v_', '', 1)
                        };
                        ctrls[1] = 'as';
                    } else {
                        let asValue = ctrls.slice(2).join(' ');
                        expr = artExpr.extractAsExpr(asValue);
                    }
                    if (expr.bad || ctrls[1] != 'as') {
                        slog.ever(chalk.red(`unsupport or bad ${k} {{${li.art}}} at line:${li.line}`), 'file', chalk.grey(e.shortHTMLFile));
                        throw new Error(`unsupport or bad ${k} {{${li.art}}}`);
                    }
                    if (!expr.key) {
                        expr.key = utils.uId('$q_key_', '', 1);
                    }
                    return `loop_declare="<%let ${expr.key},${expr.vars}=${ctrls[0]}[${expr.key}]%>" ${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%(${expr.vars},${expr.key}) in ${ctrls[0]}%>"`;
                }
                return _;
            }).replace(ifReg, (_, k, $, c) => {
                c = tmplCmd.recover(c, cmds);
                let li = artExpr.extractArtInfo(c);
                if (li) {
                    let expr = artExpr.extractIfExpr(li.art);
                    let key = k == 'for' ? 'for' : 'if';
                    return `${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%${key}(${expr});%>"`;
                }
                return _;
            });
        } else {
            m = m.src;
        }
        return m;
    });
    //console.log(src);
    for (let c in cmds) {
        let v = cmds[c];
        if (util.isString(v)) {
            v = artExpr.removeLine(v);
            cmds[c] = v;
        }
    }
    src = tmplCmd.recover(src, cmds);
    src = artExpr.recoverEvent(src);
    //console.log(src);
    return src;
};
let combineSamePush = (src, pushed) => {
    let start = -1,
        prev = '',
        ranges = [];
    for (let p of pushed) {
        let i = src.indexOf(p.src, start);
        if (i >= 0) {
            if (i == start && prev == p.key) {
                ranges.push({
                    start: i - 2,//$vnode.push($create());  trim );
                    end: i + p.key.length + 6 //$vnode.push($create()); trim $vnode.push(
                });
            }
            start = i + p.src.length;
            prev = p.key;
        }
    }
    for (let i = ranges.length; i--;) {
        let r = ranges[i];
        src = src.substring(0, r.start) + ',' + src.substring(r.end);
    }
    return src;
};
let process = (src, e) => {
    //console.log(src);
    let { cmds, tokens } = parser(src, e);
    let snippets = [];
    let vnodeDeclares = Object.create(null),
        vnodeInited = Object.create(null),
        combinePushed = [];
    let genElement = (node, level) => {
        if (node.type == 3) {
            let cnt = tmplCmd.recover(node.content, cmds);
            let di = extractDeclares(cnt);
            for (let d of di.declares) {
                snippets.push(d);
            }
            if (di.tmpl) {
                let text = serAttrs('$text', di.tmpl, false, e);
                //console.log(text);
                let outText = '',
                    safeguard = false;
                if (text.direct) {
                    outText = text.returned;
                } else {
                    vnodeDeclares.$text = 1;
                    snippets.push(text.returned);
                    outText = '$text';
                    safeguard = !text.hasSnippet;
                }
                let safe = safeguard ? `$text&&` : '';
                if (vnodeInited[level] === 1) {
                    if (!safeguard) {
                        combinePushed.push({
                            key: `$vnode${level}`,
                            src: `$vnode${level}.push($create(0/*,$views*/,${outText}));`
                        });
                    }
                    snippets.push(`${safe}$vnode${level}.push($create(0/*,$views*/,${outText}));`);
                } else {
                    vnodeInited[level] = 1;
                    snippets.push(`$vnode${level}=${safe}[$create(0/*,$views*/,${outText})];`);
                }
            }
        } else {
            let attrs = {},
                attrsStr = '',
                ctrlAttrs = [],
                hasCtrl = false,
                hasAttrs = false;
            if (node.attrs.length) {
                hasAttrs = true;
                for (let a of node.attrs) {
                    if (a.quote) {
                        a.value = tmplCmd.recover(a.value, cmds);
                    } else {
                        a.value = true;
                    }
                    if (a.name == a.value) {
                        let bProps = attrMap.getBooleanProps(node.tag, node.inputType);
                        if (bProps[a.name]) {
                            a.value = true;
                        }
                    }
                    let oKey = a.name.replace(escapeSlashRegExp, '\\$&');
                    let key = `$$_${a.name.replace(/[^a-zA-Z]/g, '_')}`;
                    let attr = serAttrs(key, a.value, true, e);
                    if (attr.direct) {
                        attrs[oKey] = attr.returned;
                    } else {
                        vnodeDeclares[key] = 1;
                        hasCtrl = true;
                        ctrlAttrs.push(`${attr.returned};$attrs['${oKey}']=${key};`);
                    }
                }
                if (hasCtrl) {
                    attrsStr = '$attrs={';
                    for (let p in attrs) {
                        attrsStr += `'${p}':${attrs[p]},`;
                    }
                    attrsStr = attrsStr + '};';
                    for (let c of ctrlAttrs) {
                        attrsStr += c;
                    }
                    snippets.push(attrsStr);
                    vnodeDeclares.$attrs = 1;
                    attrsStr = '$attrs';
                } else {
                    attrsStr = '{';
                    for (let p in attrs) {
                        attrsStr += `'${p}':${attrs[p]},`;
                    }
                    attrsStr = attrsStr.slice(0, -1) + '}';
                }
            }
            let ctrls = node.ctrls;
            let start = [], end = [];
            if (ctrls.length) {
                for (let ctrl of ctrls) {
                    let fn = Directives[ctrl.type];
                    if (fn) {
                        fn(ctrl, start, end, node.auto);
                    }
                }
            }
            snippets.push(`${start.join('')}`);
            if (node.children.length) {
                vnodeDeclares['$vnode' + (level + 1)] = 1;
                delete vnodeInited[level + 1];
                let first = node.children[0];
                if (first.hasCtrls) {
                    snippets.push(`$vnode${level + 1}=[];`);
                    vnodeInited[level + 1] = 1;
                }
                for (let e of node.children) {
                    genElement(e, level + 1);
                }
            }
            if (node.tag == 'group') {
                if (node.children.length) {
                    if (vnodeInited[level] === 1) {
                        //for translate to es3 
                        /*combinePushed.push({
                            key: `$vnode${level}`,
                            src: `$vnode${level}.push(...$vnode${level + 1});`
                        });*/
                        snippets.push(`$vnode${level}.push(...$vnode${level + 1});`);
                    } else {
                        vnodeInited[level] = 1;
                        snippets.push(`$vnode${level}=$vnode${level + 1};`);
                    }
                }
            } else if (node.tag == 'direct') {
                snippets.push(`$__line=${node.directLine};$__art='{{${node.directArt}}}';$__ctrl='${node.directCtrl.replace(escapeSlashRegExp, '\\$&')}';`);
                if (vnodeInited[level] === 1) {
                    snippets.push(`if(${node.directCtrl}){$vnode${level}.push(${node.directCtrl});}`);
                } else {
                    vnodeInited[level] = 1;
                    snippets.push(`$vnode${level}=${node.directCtrl}?[${node.directCtrl}]:$empty_arr;`);
                }
            } else {
                let unary = node.unary ? '1' : '';
                let props = hasAttrs ? attrsStr : unary ? '0' : '';
                let children = node.children.length ? `$vnode${level + 1}` : props ? '0' : '';
                let content = '';
                if (children) {
                    content += ',' + children;
                    if (props) {
                        content += ',' + props;
                        if (unary) {
                            content += ',' + unary;
                        }
                    }
                }
                if (vnodeInited[level] === 1) {
                    combinePushed.push({
                        key: `$vnode${level}`,
                        src: `$vnode${level}.push($create("${node.tag}"/*,$views*/${content}));`
                    });
                    snippets.push(`$vnode${level}.push($create("${node.tag}"/*,$views*/${content}));`);
                } else {
                    vnodeInited[level] = 1;
                    snippets.push(`$vnode${level}=[$create("${node.tag}"/*,$views*/${content})];`);
                }
            }
            snippets.push(end.join(''));
        }
    };
    vnodeInited[0] = 1;
    for (let t of tokens) {
        genElement(t, 0);
    }
    let source = 'let $_temp,$vnode0=[],$empty_arr=[]';
    for (let vd in vnodeDeclares) {
        source += ',' + vd;
    }
    source = `${source};\r\n${snippets.join('')}\r\nreturn $create($viewId/*,$views*/,$vnode0);`;
    source = combineSamePush(source, combinePushed);
    if (configs.debug) {
        source = `let $__art,$__line,$__ctrl;try{${source}}catch(ex){let msg='render view error:'+(ex.message||ex);msg+='\\r\\n\\tsrc art: '+$__art+'\\r\\n\\tat line: '+$__line;msg+='\\r\\n\\ttranslate to: '+$__ctrl+'\\r\\n\\tat file:${e.shortHTMLFile}';throw msg;}`;
    }
    source = `($$,$create,$viewId,$e,$n,$eu,$i,$eq/*,$views*/)=>{${source}}`;
    //console.log(source);
    source = configs.compileTmplCommand(`${source}`, configs);
    //console.log(source);
    if (source.startsWith('(function')) {
        source = source.substring(1).replace(closeReg, '');
    }
    return source;
};
module.exports = {
    preProcess,
    process
};