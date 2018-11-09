let acorn = require('./js-acorn');
let slog = require('./util-log');
let chalk = require('chalk');
module.exports = {
    process(tmpl, sourceFile) {
        let ast;
        try {
            ast = acorn.parse(tmpl, null, sourceFile);
        } catch (ex) {
            slog.ever(chalk.red(`[MXC Error(js-module-parser)]`), ex.message, 'near', tmpl.substring(Math.max(0, ex.pos - 20), Math.min(ex.pos + 20, tmpl.length)));
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
                        raw: tmpl.substring(node.start, node.end),
                        module: node.source.value,
                        moduleStart: node.source.start,
                        moduleEnd: node.source.end
                    });
                }
            },
            CallExpression(node) {
                if (node.arguments.length == 1) {
                    let a0 = node.arguments[0];
                    let callee = node.callee;
                    let last = modules[modules.length - 1];
                    if (last && !last.isParam && node.start < last.start && node.end > last.end) {
                        last.isParam = true;
                    }
                    if (callee.type == 'Identifier' &&
                        a0.type == 'Literal' &&
                        callee.name == 'require') {
                        modules.push({
                            type: 'require',
                            start: node.start,
                            end: node.end,
                            raw: tmpl.substring(node.start, node.end),
                            module: a0.value,
                            moduleStart: a0.start,
                            moduleEnd: a0.end
                        });
                    } else if (callee.type == 'Import') {
                        modules.push({
                            type: 'dimport',
                            start: node.start,
                            end: node.end,
                            raw: tmpl.substring(node.start, node.end),
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