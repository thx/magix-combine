/*
acorn lib
 */
let acorn = require('acorn');
let walker = require('acorn-walk');
let dyncmicImport = require('acorn-dynamic-import');
let importWalk = require('acorn-dynamic-import/lib/walk');
walker = importWalk.default(walker);
acorn = acorn.Parser.extend(dyncmicImport.default);
module.exports = {
    parse(tmpl, comments, sourceFile) {
        return acorn.parse(tmpl, {
            sourceType: 'module',
            ecmaVersion: 9,
            sourceFile,
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