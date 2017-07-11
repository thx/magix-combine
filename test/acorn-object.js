let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let t = `
    ({a,b,c:12,d:e,user:{xxxx,yyyyy},[user.name]:user.name,[user]:name})
`;
t = t.trim();
let ast = acorn.parse(t);
let modifiers = [];
walker.simple(ast, {
    Property(node) {
        if (node.value.type == 'Identifier' || node.value.type == 'MemberExpression') {
            let oValue = t.slice(node.value.start, node.value.end);
            if (node.shorthand) {
                modifiers.push({
                    start: node.end,
                    end: node.end,
                    value: ':",' + oValue + ',"~'
                });
            } else if (node.computed) {
                modifiers.push({
                    start: node.key.start - 1,
                    end: node.key.end + 1,
                    value: '",' + t.slice(node.key.start, node.key.end) + ',"~'
                }, {
                    start: node.value.start,
                    end: node.value.end,
                    value: '",' + oValue + ',"~'
                });
            } else {
                modifiers.push({
                    start: node.value.start,
                    end: node.value.end,
                    value: '",' + oValue + ',"~'
                });
            }
        }
    }
});

modifiers.sort((a, b) => { //根据start大小排序，这样修改后的fn才是正确的
    return a.start - b.start;
});
for (let i = modifiers.length - 1, m; i >= 0; i--) {
    m = modifiers[i];
    t = t.slice(0, m.start) + m.value + t.slice(m.end);
}
console.log('"~' + t.slice(1, -1) + '"');