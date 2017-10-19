
let autoprefixer = require('autoprefixer');
let postcss = require('postcss');
let configs = require('./util-config');
module.exports = css => {
    return new Promise((resolve, reject) => {
        postcss(autoprefixer(configs.autoprefixer)).process(css).then(res => {
            resolve(res.css);
        }).catch(ex => {
            reject(ex);
        });
    });
};