let acorn = require('./js-acorn');
let slog = require('./util-log');
let chalk = require('chalk');
module.exports = {
    process(tmpl) {
        let ast;
        try {
            ast = acorn.parse(tmpl);
        } catch (ex) {
            slog.ever(chalk.red('parse js error at js-module-parser'), ex.message);
            throw ex;
        }
        let modules = [];
        acorn.walk(ast, {
            ImportDeclaration(node) {
                if (node.source.type == 'Literal') {
                    modules.push({
                        type: 'import',
                        start: node.start,
                        end: node.end,
                        raw: tmpl.slice(node.start, node.end),
                        module: node.source.value,
                        moduleStart: node.source.start,
                        moduleEnd: node.source.end
                    });
                }
            },
            CallExpression(node) {
                if (node.callee.type == 'Identifier' && node.arguments.length == 1) {
                    if (node.arguments[0].type == 'Literal' && node.callee.name == 'require') {
                        let a0 = node.arguments[0];
                        modules.push({
                            type: 'require',
                            start: node.start,
                            end: node.end,
                            raw: tmpl.slice(node.start, node.end),
                            module: a0.value,
                            moduleStart: a0.start,
                            moduleEnd: a0.end
                        });
                    }
                }
            }
        });
        modules.sort((a, b) => a.start - b.start);
        return modules;
    }
};