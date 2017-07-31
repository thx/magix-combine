module.exports = {
    md5CssFileLen: 2,
    md5CssSelectorLen: 2,
    thisAlias: '', //this别名
    tmplFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    srcFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    cssnanoOptions: { //css压缩选项
        safe: true
    },
    lessOptions: {}, //less编译选项
    sassOptions: {}, //sass编译选项
    cssSelectorPrefix: '', //css选择器前缀，通常可以是项目的简写，多个项目同时运行在magix中时有用
    loaderType: 'cmd', //加载器类型
    htmlminifierOptions: { //html压缩器选项 https://www.npmjs.com/package/html-minifier
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        quoteCharacter: '"',
        keepClosingSlash: true, //
        removeEmptyAttributes: true,
        collapseInlineTagWhitespace: true,
        caseSensitive: true
    },
    log: true, //日志及进度条
    checker: {
        css: true, //样式
        cssUrl: true, //样式中的url
        jsLoop: true, //js循环
        jsService: true, //js接口服务
        jsThis: true, //js this别名
        tmplAttrImg: true, //模板img属性
        tmplDisallowedTag: true, //不允许的标签
        tmplAttrDangerous: true, //危险的属性
        tmplAttrAnchor: true, //检测anchor类标签
        tmplAttrIframe: true, //检测iframe相关
        tmplAttrMxEvent: true, //mx事件
        tmplAttrMxView: true, //mx view
        tmplDuplicateAttr: true, //重复的属性
        tmplCmdFnOrForOf: true
    },
    compressCss: true, //是否压缩css内容
    compressCssSelectorNames: true, //是否压缩css选择器名称，默认只添加前缀，方便调试
    addEventPrefix: true, //mx事件增加前缀
    bindEvents: ['change'], //绑定表达式<%:expr%>绑定的事件
    bindName: 'syncValue', //绑定表达式<%:expr%>绑定的处理名称
    globalCss: [], //全局样式
    scopedCss: [], //全局但做为scoped使用的样式
    uncheckGlobalCss: [], //对某些全局样式不做检查
    useAtPathConverter: true, //是否使用@转换路径的功能
    compileFileExtNames: ['js', 'mx', 'ts'], //选择编译时的后缀名
    tmplFileExtNames: ['html', 'mx'], //模板后缀
    tmplUnchangableVars: {}, //模板中不会变的变量，减少子模板的分析
    tmplGlobalVars: {}, //模板中全局变量
    outputTmplWithEvents: false, //输出事件
    disableMagixUpdater: false,
    compressTmplVariable: true, //是否压缩模板中的变量
    tmplPadCallArguments(name) { //模板中某些函数的调用，我们可以动态添加一些参数。
        return '';
    },
    beforeWriteFile(e) {
        return e;
    },
    compileBeforeProcessor(content, from) { //开始编译某个js文件之前的处理器，可以加入一些处理，比如typescript的预处理
        return content;
    },
    compileAfterProcessor(e) { //结束编译
        return e;
    },
    mxTagProcessor(tmpl, e) { //mx-tag的处理器
        return tmpl;
    },
    tmplTagProcessor(tag) {
        return tag;
    },
    cssNamesProcessor(tmpl, cssNamesMap) { //模板中class名称的处理器
        return tmpl;
    },
    compileTmplCommand(tmpl) {
        return tmpl;
    },
    cssUrlMatched(url) { //样式中匹配到url时的处理器
        return url;
    },
    tmplImgSrcMatched(url) { //模板中匹配到img标签时的处理器
        return url;
    },
    resolveModuleId(id) { //处理模块id时的处理器
        return id;
    },
    resolveRequire(reqInfo, context) { //处理rqeuire时的处理器
        return reqInfo;
    }
};