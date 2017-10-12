let tmplCmdReg = /<%([@=!:~#])?([\s\S]*?)%>|$/g;
let lineBreakReg = /\r\n?|\n|\u2028|\u2029/;
let scharReg = /(?:`;|;`)/g;
let badCmdReg = /(<[^%;`<>]+?%>|<%[^%;`<>]+?>)/g;
let acorn = require('acorn');
module.exports = tmpl => {
    let fn = [];
    let index = 0;
    tmpl.replace(tmplCmdReg, (match, operate, content, offset) => {
        let start = 2;
        if (operate) {
            start = 3;
            if (content.trim()) {
                content = '(' + content + ')';
            }
        }
        let source = tmpl.slice(index, offset + start).replace(/`/g, ' ');
        index = offset + match.length - 2;
        fn.push(';`' + source + '`;', content || '');
    });
    tmpl = fn.join('');
    let lines = tmpl.split(lineBreakReg);
    try {
        acorn.parse(tmpl);
    } catch (ex) {
        let line = ex.loc.line - 1;
        let end = line;
        let start = line;
        while (start > 0) {
            let c = lines[start--];
            let m = c.match(tmplCmdReg);
            if (m.length > 1) {
                break;
            }
        }
        while (end < line.length - 1) {
            let c = lines[end++];
            let m = c.match(tmplCmdReg);
            if (m.length > 1) {
                break;
            }
        }

        let outs = [];
        let index = line - start;
        while (start <= end) {
            outs.push((start + 1) + '.' + lines[start++].replace(scharReg, ''));
        }
        start = 0;
        let reasons = [];
        while (start < lines.length) {
            let c = lines[start++];
            let m = c.match(badCmdReg);
            if (m) {
                reasons.push({
                    line: start,
                    value: m[0]
                });
            }
        }
        let e = new SyntaxError(ex.message);
        e.from = 'Tmpl JS Syntax Checker';
        e.lines = outs;
        e.line = line;
        e.column = ex.loc.column;
        e.index = index;
        e.reasons = reasons;
        throw e;
    }
};