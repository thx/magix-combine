module.exports = {
    md5KeyLen: 3,
    tmplFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    srcFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    buildFolder: 'build', //压缩上线文件夹
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
    outputTmplObject: false, //输出模板字符串为一个对象
    excludeTmplFolders: [], //不让该工具处理的文件夹或文件
    snippets: {}, //代码片断，对于在项目中重复使用且可能修改的html代码片断有用
    compressCssSelectorNames: false, //是否压缩css选择器名称，默认只添加前缀，方便调试
    useMagixTmplAndUpdater: false,
    mxTagProcessor: function(tmpl) {
        return tmpl;
    },
    atAttrProcessor: function(name, tmpl) { //对于html字符串中带@属性的特殊处理器，扩展用
        return tmpl;
    },
    compressTmplCommand: function(tmpl) { //压缩模板命令，扩展用
        return tmpl;
    },
    processAttachedFile: function() { //让外部决定如何处理同名的html或css文件，默认magix一个区块由html,css,js组成，如index.html index.css index.js 。打包时默认这3个文件打包成一个js文件，但有时候像css一些项目并不希望打包到js中，所以可以实现该方法来决定自己的方案

    }
};