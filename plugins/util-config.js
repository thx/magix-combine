module.exports = {
    md5CssFileLen: 2,
    md5CssSelectorLen: 2,
    tmplFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    srcFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    cssnanoOptions: { //css压缩选项
        safe: true
    },
    lessOptions: {}, //less编译选项
    sassOptions: {}, //sass编译选项
    cssSelectorPrefix: 'mx-', //css选择器前缀，通常可以是项目的简写，多个项目同时运行在magix中时有用
    loaderType: 'cmd', //加载器类型
    htmlminifierOptions: { //html压缩器选项 https://www.npmjs.com/package/html-minifier
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        quoteCharacter: '"',
        keepClosingSlash: true, //
        collapseInlineTagWhitespace: true,
        caseSensitive: true
    },
    log: true,
    compressCss: true, //是否压缩css内容
    addEventPrefix: true, //mx事件增加前缀
    bindEvents: ['change'],
    globalCss: [],
    scopedAsGlobalCss: [],
    bindName: 's\u0011e\u0011t',
    useAtPathConverter: true,
    compileFileExtNames: ['js', 'mx'], //选择编译时的后缀名
    tmplUnchangableVars: {}, //模板中不会变的变量，减少子模板的分析
    tmplGlobalVars: {}, //模板中全局变量
    outputTmplWithEvents: false, //输出事件
    excludeTmplFolders: [], //不让该工具处理的文件夹或文件
    excludeTmplFiles: [],
    compressCssSelectorNames: false, //是否压缩css选择器名称，默认只添加前缀，方便调试
    disableMagixUpdater: false,
    startProcessor: function(file) {
        return Promise.resolve(file);
    },
    afterDependenceAnalysisProcessor: function(e) {
        return Promise.resolve(e);
    },
    compileBeforeProcessor: function(content) {
        return content;
    },
    compileAfterProcessor: function(content) {
        return content;
    },
    mxTagProcessor: function(tmpl, info) {
        return tmpl;
    },
    excludeFileContent: function(content) {

    },
    cssNamesProcessor: function(tmpl, cssNamesMap) {
        return tmpl;
    },
    compressTmplCommand: function(tmpl) { //压缩模板命令，扩展用
        return tmpl;
    },
    cssUrlMatched: function(url) {
        return url;
    },
    tmplImgSrcMatched: function(url) {
        return url;
    },
    resolveModuleId: function(id) {
        return id;
    },
    resolveRequire: function(reqInfo, context) {
        return reqInfo;
    }
};