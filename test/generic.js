let generic = require('../plugins/js-generic');
let chalk = require('chalk');
let expect = (source, result) => {
    if (source != result) {
        console.log('expect:', chalk.red(result), 'source:', chalk.red(source));
    } else {
        console.log('ok:', chalk.blue(result));
    }
};

expect(generic.trimParentheses('((e)||e)'),'(e)||e');
expect(generic.trimParentheses('(e)||e)'),'(e)||e)');
expect(generic.trimParentheses(' ( (e)||  e ) '),'(e)||  e');
expect(generic.trimParentheses('(((e)||e))'),'(e)||e');
expect(generic.trimParentheses('(a||b)||(c||d)'),'(a||b)||(c||d)');
expect(generic.trimParentheses('(((a||b)||(c||d)))'),'(a||b)||(c||d)');
expect(generic.trimParentheses('(()()())'),'()()()');