module.exports = {
    md5KeyLen: 4,
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
        //removeAttributeQuotes: true, //属性引号
        quoteCharacter: '"',
        keepClosingSlash: true //
    },
    tmplGlobalVars: {}, //模板中全局变量
    outputTmplWithEvents: false, //输出事件
    excludeTmplFolders: [], //不让该工具处理的文件夹或文件
    compressCssSelectorNames: false, //是否压缩css选择器名称，默认只添加前缀，方便调试
    useMagixTmplAndUpdater: false,
    mxTagProcessor: function(tmpl) {
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
    }
};