declare module "magix-combine" {
    interface ICombineResult {
        /**
         * 通过config指定的tmplFolder文件夹中的文件路径
         */
        from: string
        /**
         * 通过config指定的srcFolder文件夹中的文件路径
         */
        to: string | undefined
        /**
         * 当前编译的from文件依赖的其它文件
         */
        fileDeps: {
            [key: string]: 1
        }
        /**
         * 文件内容
         */
        content: string
        /**
         * 指示是否排除define的包装
         */
        exclude: boolean
        /**
         * 指示是否把该文件内容根据to的位置写入到硬盘上
         */
        writeFile: boolean
        /**
         * 模块id
         */
        moduleId: string
        /**
         * 依赖的其它模块，同requires
         */
        deps: string[]
        /**
         * 依赖的其它模块，同deps
         */
        requires: string[]
        /**
         * 依赖的模块声明的变量
         */
        vars: string[]
        /**
         * 当前js文件收集到的样式名称映射对象
         */
        cssNamesMap: {
            [originalSelector: string]: string
        }
        /**
         * 当前js文件收集到的样式名称所在的文件
         */
        cssNamesInFiles: {
            [selector: string]: string
        }
        /**
         * 当前js文件收集到的样式标签名称所在的文件
         */
        cssTagsInFiles: {
            [tag: string]: string
        },
        /**
         * 模块包名
         */
        pkgName: string
    }
    interface IRequireInfo {
        /**
         * require语句变量前面的前缀信息，如var或,等
         */
        prefix: string
        /**
         * require语句后面的信息，如;等
         */
        tail: string
        /**
         * 未经任何处理的原始模块id
         */
        originalDependedId: string
        /**
         * 依赖的id
         */
        dependedId: string
        /**
         * 声明的变量字符串
         */
        variable: string
        /**
         * 如果存在该字段，则把require语句换成该字段指定的内容
         */
        replacement?: string
    }
    interface ICheckerConfig {
        /**
         * 样式
         */
        css: boolean
        /**
         * 样式中的url
         */
        cssUrl: boolean
        /**
         * js循环
         */
        jsLoop: boolean
        /**
         * js接口服务
         */
        jsService: boolean
        /**
         * js this别名
         */
        jsThis: boolean
        /**
         * 模板img属性
         */
        tmplAttrImg: boolean
        /**
         * 不允许的标签
         */
        tmplDisallowedTag: boolean
        /**
         * 危险的属性
         */
        tmplAttrDangerous: boolean
        /**
         * 需要添加noopener
         */
        tmplAttrNoopener: boolean
        /**
         * 检测anchor类标签
         */
        tmplAttrAnchor: boolean
        /**
         * mx事件
         */
        tmplAttrMxEvent: boolean
        /**
         * mx view
         */
        tmplAttrMxView: boolean
        /**
         * 重复的属性
         */
        tmplDuplicateAttr: boolean
        /**
         * 模板中函数或for of检测
         */
        tmplCmdFnOrForOf: boolean
        /**
         * 标签配对
         */
        tmplTagsMatch: boolean
    }
    interface IConfig {
        /**
         * 编译的模板目录。默认tmpl
         */
        tmplFolder?: string
        /**
         * 编译结果存储目录。默认src
         */
        srcFolder?: string
        /**
         * 匹配模板中模板引擎语句的正则，对模板处理时，先去掉无关的内容处理起来会更准确
         */
        tmplCommand?: RegExp
        /**
         * cssnano压缩选项
         */
        cssnanoOptions?: object
        /**
         * less编译选项
         */
        lessOptions?: object
        /**
         * sass编译选项
         */
        sassOptions?: object
        /**
         * 生成样式选择器时的前缀，通常是项目名。默认为mx-
         */
        cssSelectorPrefix?: string
        /**
         * 加载器类型，该选项决定如何添加包装，如添加define函数。默认为cmd加载器
         */
        loaderType?: "amd" | "cmd" | "iife" | "none" | "webpack" | "kissy"
        /**
         * html压缩选项
         */
        htmlminifierOptions?: object
        /**
         * 是否输出日志信息。默认为true
         */
        log?: boolean

        /**
         * 编译成调试版本，默认false
         */
        debug?: boolean
        /**
         * 检测对象
         */
        checker?: ICheckerConfig
        /**
         * 是否把模板中的view打包到js中的文件依赖中，默认false
         */
        addTmplViewsToDependencies?: boolean
        /**
         * 是否支持多绑定，默认false
         */
        tmplMultiBindEvents?: boolean
        /**
         * 是否增加事件前缀，开启该选项有利于提高magix查找vframe的效率。默认为true
         */
        tmplAddEventPrefix?: boolean
        /**
         * 绑定表达式<%:expr%>绑定的事件。默认为["change"]
         */
        tmplBindEvents?: string[]
        /**
         * 绑定表达式<%:expr%>绑定的处理名称。默认为syncValue
         */
        tmplBindName?: string
        /**
         * 项目中使用的全局样式，不建议使用该选项
         */
        globalCss?: string[]
        /**
         * 项目中全局但做为scoped使用的样式
         */
        scopedCss?: string[]
        /**
         * 对样式做检测时，忽略某些全局样式的检测，该选项配合globalCss使用。
         */
        uncheckGlobalCss?: string[]
        /**
         * 是否使用@转换路径的功能，如@./index转换成app/views/orders/index。默认为true
         */
        useAtPathConverter?: boolean
        /**
         * 待编译的文件后缀，默认为["js","mx"]
         */
        jsFileExtNames?: string[]
        /**
         * 待编译的模板文件后缀，默认为["html","mx"]
         */
        tmplFileExtNames?: string[]
        /**
         * 模板中不会变的变量，减少不必要的子模板的分析输出
         */
        tmplConstVars?: object
        /**
         * 模板中的全局变量，这些变量不会做scope处理
         */
        tmplGlobalVars?: object
        /**
         * 模板标签匹配检测时，不去检测的标签名称
         */
        tmplUncheckTags?: object
        /**
         * 模板输出时是否输出识别到的事件列表，默认为false
         */
        tmplOutputWithEvents?: boolean
        /**
         * 是否禁用magix view中的updater，该选项影响模板对象的输出，默认为false
         */
        disableMagixUpdater?: boolean
        /**
         * 补充模板中方法调用时的参数
         */
        tmplPadCallArguments?: (name: string) => string
        /**
         * 编译文件被写入硬盘时调用
         */
        writeFileStart?: (e: ICombineResult) => void
        /**
         * 开始编译某个js文件之前的处理器，可以加入一些处理，比如typescript的预处理
         */
        compileJSStart?: (content: string, from?: string) => Promise<string> | string
        /**
         * 结束编译时的处理器
         */
        compileJSEnd?: (e: ICombineResult) => ICombineResult | Promise<ICombineResult>
        /**
         * 开始编译css前处理器
         */
        compileCSSStart?: (css: string) => Promise
        /**
         * 结束编译css时的处理器
         */
        compileCSSEnd?: (css: string) => Promise
        /**
         * 对mx-tag这样的标签做加工处理
         */
        mxTagProcessor?: (tmpl: string, e?: ICombineResult) => string
        /**
         * 对模板中的标签做处理
         */
        tmplTagProcessor?: (tag: string) => string
        /**
         * 对模板中的样式类做处理
         */
        cssNamesProcessor?: (tmpl: string, cssNamesMap?: object) => string
        /**
         * 转换模板中的命令字符串
         */
        compileTmplCommand?: (tmpl: string, config: IConfig) => string
        /**
         * 开始转换模板
         */
        compileTmplStart?: (tmpl: string) => string
        /**
         * 结束转换模板
         */
        compileTmplEnd?: (tmpl: string) => string
        /**
         * 对css中匹配到的url做处理
         */
        cssUrlMatched?: (url: string) => string
        /**
         * 对模板中img标签src的url做处理
         */
        tmplImgSrcMatched?: (url: string) => string
        /**
         * 加工处理模块id
         */
        resolveModuleId?: (moduleId: string) => string
        /**
         * 加工处理require语句
         */
        resolveRequire?: (requireInfo: IRequireInfo, e?: ICombineResult) => void
    }

    /**
     * 配置打包编译参数
     * @param cfg 配置对象
     */
    function config(cfg: IConfig): IConfig
    /**
     * 遍历文件夹及子、孙文件夹下的文件
     * @param folder 文件夹
     * @param callback　回调
     */
    function walk(folder: string, callback: (file: string) => void): void

    /**
     * 读取文件内容
     * @param file 文件路径
     * @param original 是否二进制数据
     */
    function readFile<T>(file: string, original: boolean): T
    /**
     * 复制文件，当复制到的路径中文件夹不存在时，会自动创建文件夹
     * @param from 源文件位置
     * @param to 复制到目标位置
     */
    function copyFile(from: string, to: string): void

    /**
     * 写入文件内容，当目标位置中的文件夹不存在时，会自动创建文件夹
     * @param to 目标位置
     * @param content　文件内容
     */
    function writeFile(to: string, content: string): void

    /**
     * 移除magix-combine中对该文件相关的依赖及其它信息
     * @param from 模板文件夹tmpl中的文件
     */
    function removeFile(from: string): void
    /**
     * 根据配置信息编译整个项目中的文件
     */
    function combine(): Promise<void>

    /**
     * 编译单个模板文件并写入src目录
     * @param from 模板文件夹tmpl中的文件
     */
    function processFile(from: string): Promise<void>

    /**
     * 编译文件内容，返回编译后的对象，不写入到硬盘
     * @param from 模板文件夹tmplFolder中的文件
     * @param to 源文件夹srcFolder中的文件位置，可选
     * @param content 文件内容，可选
     */
    function processContent(from: string, to?: string, content?: string): Promise<ICombineResult>

    /**
     * 处理tmpl文件夹中的模板文件，通常向节点添加spm等属性
     */
    function processTmpl(): Promise<void>
    /**
     * 移除模板中的命令语句
     * @param tmpl 源模板
     */
    function stripCmd(tmpl: string): string

    /**
     * 移除某个文件的缓存，在下次编译的时候重新编译该文件
     * @param file 文件路径
     */
    function removeCache(file: string): void
}