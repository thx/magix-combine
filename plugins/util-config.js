let classReg = /\bclass\s*=\s*"[^"]+/;
let compound = defaultTag => {
    return i => {
        let a = i.seprateAttrs(defaultTag);
        let host = `<${a.tag} ${a.attrs}`;
        if (a.unaryTag) {
            host += '/>';
        } else {
            host += `>${i.content}</${a.tag}>`;
        }
        //console.log(a);
        return `${host}<div mx-view="${i.mxView}" ${a.viewAttrs} class="pa none"></div>`;
    };
};
module.exports = {
    loaderType: 'cmd', //加载器类型
    commonFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    compiledFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    cssnano: { //css压缩选项
        safe: true,
        autoprefixer: false,
        minifyFontValues: false
    },
    less: {}, //less编译选项
    sass: {}, //sass编译选项
    autoprefixer: {},
    checkOldTempalte: false,
    projectName: null, //css选择器前缀，通常可以是项目的简写，多个项目同时运行在magix中时有用
    htmlminifier: { //html压缩器选项 https://www.npmjs.com/package/html-minifier
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        quoteCharacter: '"', //属性引号
        removeEmptyAttributes: true, //移除空的属性
        collapseInlineTagWhitespace: true, //移除标签间的空白
        caseSensitive: true, //保持大小写
        keepClosingSlash: true,
        //collapseBooleanAttributes: true,//boolean属性
        removeRedundantAttributes: true //移除默认的属性，如input当type="text"时 type可被移除
    },
    log: true, //日志及进度条
    debug: false, //
    //thisAlias: '', //this别名
    jsLoopDepth: 4,
    revisableStringPrefix: '',//set default value at util-init.js
    checker: {
        css: true, //样式
        cssUrl: false, //样式中的url
        jsLoop: true, //js循环
        jsService: true, //js接口服务
        //jsThis: true, //js this别名
        tmplCmdSyntax: true,//命令语法检查
        tmplAttrImg: false, //模板img属性
        tmplDisallowedTag: true, //不允许的标签
        tmplAttrDangerous: true, //危险的属性
        tmplAttrAnchor: true, //检测anchor类标签
        tmplAttrIframe: true, //检测iframe相关
        tmplAttrMxEvent: true, //mx事件
        tmplAttrMxView: true, //mx view
        tmplDuplicateAttr: true, //重复的属性
        tmplCmdFnOrForOf: true, //模板中函数或for of检测
        tmplTagsMatch: true //标签配对
    },
    tmplFileExtNames: ['html', 'haml', 'pug', 'jade', 'tpl'], //模板后缀
    tmplConstVars: {
        vId: 1,
        viewId: 1
    }, //模板中不会变的变量，减少子模板的分析
    tmplGlobalVars: {
        $_temp: 100,//
        window: 1,
        JSON: 1,
        document: 1,
        console: 1,
        Math: 1,
        Number: 1,
        isNaN: 1,
        isFinite: 1,
        parseInt: 1,
        parseFloat: 1,
        Infinity: 1,
        NaN: 1,
        encodeURIComponent: 1,
        decodeURIComponent: 1,
        escape: 1,
        unescape: 1,
        encodeURI: 1,
        decodeURI: 1,
        eval: 1,
        history: 1,
        localStorage: 1,
        sessionStorage: 1,
        navigator: 1,
        Array: 1,
        Date: 1,
        String: 1,
        Function: 1,
        Boolean: 1,
        Object: 1
    }, //模板中全局变量
    tmplAddViewsToDependencies: false, //是否把模板中的view做为依赖提前加载
    tmplOutputWithEvents: false, //输出事件
    tmplCompressVariable: true, //是否压缩模板中的变量
    tmplArtEngine: true,//类mustach模板引擎，因代码多参考artTempalte，因此以art命名
    tmplStaticAnalyze: true,//模板静态节点分析
    disableMagixUpdater: false,
    magixUpdaterIncrement: false,
    magixUpdaterQuick: false,//quick模板
    selectorSilentErrorCss: false,//css选择器处理失败时，使用原有的选择器还是提示用户出错
    sourceMapCss: false,
    importCssSyntax: false,
    magixModuleIds: ['magix'],
    globalCss: [], //全局样式
    scopedCss: [], //全局但做为scoped使用的样式
    uncheckGlobalCss: [], //对某些全局样式不做检查
    useAtPathConverter: true, //是否使用@转换路径的功能
    jsFileExtNames: ['js', 'mx', 'ts', 'jsx', 'es', 'tsx','mjs'], //选择编译时的后缀名
    galleries: {
        mxRoot: 'app/gallery/',
        mxMap: {
            //'mx-popover': compound('span'),
            //'mx-popover.index': compound('span'),
            'mx-number': {
                _class: ' input pr'
            },
            'mx-number.index': {
                _class: ' input pr'
            },
            'mx-loading'() {
                return `<div class="loading">
                            <span class="loading-anim"></span>
                        </div>`;
            },
            'mx-dropdown.item'(i) {
                return `<i ${i.attrs} class="none">${i.content}</i>`;
            },
            'mx-carousel.panel'(i) {
                if (i.attrsMap.class) {
                    i.attrs = i.attrs.replace(classReg, '$& hp100 fl none');
                } else {
                    i.attrs += ' class="hp100 fl none"';
                }
                return `<div ${i.attrs}>${i.content}</div>`;
            }
        }
    },
    customTagProcessor() {
        return '';
    },
    tmplPadCallArguments() { //模板中某些函数的调用，我们可以动态添加一些参数。
        return '';
    },
    writeFileStart(e) {
        return e;
    },
    compileJSStart(content) { //开始编译某个js文件之前的处理器，可以加入一些处理，比如typescript的预处理
        return content;
    },
    compileJSEnd(e) { //结束编译
        return e;
    },
    compileCSSStart(css) {
        return css;
    },
    compileCSSEnd(css) {
        return css;
    },
    tmplTagProcessor(tag) { //为了tmpl-naked准备的，遇到模板标签如何处理
        return tag;
    },
    cssNamesProcessor(tmpl) { //模板中class名称的处理器
        return tmpl;
    },
    compileTmplCommand(tmpl) {
        return tmpl;
    },
    compileTmplStart(tmpl) {
        return tmpl;
    },
    compileTmplEnd(tmpl) {
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
    resolveRequire() { //处理rqeuire时的处理器
    }
};