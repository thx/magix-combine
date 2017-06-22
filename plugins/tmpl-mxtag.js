let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let snippetReg = /<mx-([\w-]+)([^>]*)>([\s\S]*?)<\/mx-\1>/g;
let snippetReg1 = /<mx-([\w-]+)([^>]*)\/>/g;
module.exports = {
    process(tmpl, extInfo) {
        let compare;
        let cmdCache = Object.create(null);
        tmpl = tmplCmd.store(tmpl, cmdCache);
        let restore = tmpl => {
            return tmplCmd.recover(tmpl, cmdCache);
        };
        let tagProcessor = (match, tag, attrs, content) => {
            attrs = restore(attrs);
            let result = {
                name: tag,
                tag: tag,
                content: content,
                attrs: attrs
            };
            return configs.mxTagProcessor(result, extInfo);
        };
        let tagProcessor1 = (match, tag, attrs) => {
            attrs = restore(attrs);
            let result = {
                name: tag,
                tag: tag,
                content: '',
                attrs: attrs
            };
            return configs.mxTagProcessor(result, extInfo);
        };
        while (snippetReg.test(tmpl) || snippetReg1.test(tmpl)) {
            compare = tmpl.replace(snippetReg, tagProcessor).replace(snippetReg1, tagProcessor1);
            if (compare == tmpl) {
                break;
            } else {
                tmpl = compare;
            }
        }
        tmpl = restore(tmpl);
        return tmpl;
    }
};