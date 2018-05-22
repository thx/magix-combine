/*
acorn lib
 */
let acorn = require('acorn');
let walker = require('acorn/dist/walk');
let importWalk = require('acorn-dynamic-import/lib/walk');
require('acorn-es7-plugin')(acorn);
require('acorn5-object-spread/inject')(acorn);
require('acorn-dynamic-import/lib/inject').default(acorn);
walker = importWalk.inject(walker);
module.exports = {
    parse(tmpl, comments) {
        return acorn.parse(tmpl, {
            plugins: {
                asyncawait: true,
                objectSpread: true,
                dynamicImport: true
            },
            sourceType: 'module',
            ecmaVersion: 9,
            onComment(block, text, start, end) {
                if (comments) {
                    comments[start] = {
                        text: text.trim()
                    };
                    comments[end] = {
                        text: text.trim()
                    };
                }
            }
        });
    },
    walk(ast, visitors) {
        walker.simple(ast, visitors, walker.base);
    }
};