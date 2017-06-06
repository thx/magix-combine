## 3.2.1
1. 检测模板中未声明的变量
2. 增加原始模块`id`

## 3.2.0
1. 独立检测功能
2. 调整`d.ts`中`loaderType`
3. 调整样式选择器不推荐的算法
4. 拆分`checker`
5. 提示在模板中尽量不要使用`function`

## 3.1.4
1. 调整`css`选择器算法，更精准的指出不符合要求的选择器
2. 样式中重名的`class`在输出时，添加`.`前缀
3. `loader`增加`none`不添加任何包装
4. 默认不再输出样式中匹配到的`url`及模板中匹配到的`img`路径
5. 对无法分析、分割的模板文件进行提示，引导开发者自己解决问题
6. 调整添加`guid`算法
7. 调整输出颜色，文件统一使用灰色
8. 修复`css-parser`未识别带私有前缀的`keyframes`的问题
9. 增加`d.ts`文件

## 3.1.3
1. 不存在的文件输出短路径
2. 修复全局样式未指定所属文件的`bug`

## 3.1.2
1. 修复绑定表达式2个的时候不提示重复的`bug`
2. 支持单个绑定表达式绑定指定的事件，如`<%:[input,blur,change] user.name%>`

## 3.1.1
1. 修复全局样式被错误添加前缀的`bug`
2. 禁用日志时，最开始的进度条不输出
3. 增加`beforeProcessContent`钩子

## 3.1.0
1. `mx-view`传递的参数中，提示注意可能传递`html`片断
2. 当满足`tmpl-img`或`css-url`时，输出所在文件
3. 全新的`css-parser`，替换原来的正则处理
4. 增加样式标签规则的检测，会提示项目中未使用到标签的样式
5. 简洁的文件路径，使用模块`id`而非全部路径
6. 标记不存在的文件及样式，及时提醒可能存在的问题

## 3.0.0
1. 增加`html`默认压缩选项
2. 处理绑定参数空格问题
3. 删除`startProcessor`
4. 增加`beforeWriteFile`
5. 增加手动合并`js`文件功能，通过`'@file.js';`即可把指定文件的内容输出在当前位置，同时在被引用的文件顶部写上`'#snippet';`，指明该文件是一个代码片断，则`magix-combine`不会把这个文件写到硬盘上。`'@file.js','compile@file.js','top,compile@file.js','bottom@file.js'`
6. 删除`excludeTmplFolders`、`excludeTmplFiles`及`excludeFileContent`
7. 增加`'#exclude(define,before,after)';`标识
8. 减少大量的`log`输出为进度条
9. 修复潜在的正则问题
10. 修复模板分析变量反复赋值问题

## 2.1.0
1. 更新依赖
2. 依赖版本号配置为自动升级`bug`版本
3. 模板中方法调用，方法名称不再作为刷新依赖
4. 提供`tmplPadCallArguments`钩子，向模板中方法调用注入参数，注入的参数目前只能是模板中全局变量
5. 拆分出`tmpl-viewattr`处理
6. 增加样式检测功能，可检测项目中无用的样式，目前仅支持`magix-combine`的内置规则
7. 后期准备移除`globalCss`，请优先使用`scopeCss`，不推荐使用`全局样式`
8. 支持在模板`class`中输出的字符串替换成映射的选择器
9.　检测项目中样式：重名的、未使用到的。
10. 检测模板中使用未声明过的选择器
11. ES6、增加`let`、`const`关键字的支持
12. 支持如`input`、`img`标签不写闭合`/`

## 2.0.5
1. 增加全局的局部化处理`scopedAsGlobalCss`，增加全局样式`globalCss`方便提示
2. 增加`scoped.style`作为全局样式的局部化文件名称
3. 开放`writeFile`
4. 增加`startProcessor`钩子
5. `resolveRequire`增加`context`参数
6. 增加`afterDependenceAnalysisProcessor`钩子
7. 使用`mxv-root`虚拟根节点代替子模板分析时如果没有外层标签默认使用`div`的方案，解决`ul``li`标签拆分问题，如外层使用`ul`，子`view`循环输出`li`
8. 修复变量路径分析`bug`，旧版对`.frames[codes[keys[i].name]]`分析不正确，未能正确分析嵌套的`[]`
9. `view`传参带绑定时，使用`<%@`而非`<%=`
10. 调整`acorn`的依赖，放在外部
11. 界面变化绑定数据的表达式增加参数支持
12. 调整生成样式选择器算法，减少生成的文件内容

## 2.0.4
1. `js`解析出错，错误信息标红
2. 增加在开始或结束编译`js`内容时的钩子，方便与其它工具对接
3. 解析模板中的自定义标签时传递文件路径信息
4. 解析`mx-`开头的标签时，把`tag`改为`name`，仍然保留`tag`兼容
5. 调整单个文件的样式解析

## 2.0.3
1. 修复`view`局部刷新`bug`
2. 内部模板命令的处理
3. 修复变量提取重复的问题

## 2.0.2
1. 修复依赖未提取到的问题

## 2.0.1
1. 调整不处理的配置，增加`excludeTmplFiles`

## 2.0.0
1. 重大调整，`tmplFolder`与`srcFolder`
2. 修复变量分析bug
3. 增加变量路径输出 `<%~var%>`
4. 支持样式文件中引用其它文件中的编译名称`[ref="@../x.less:name"]`
5. 支持选择器属性`.s[a=b]`
6. 改进`keyframes`的识别
7. 修改`@`路径的识别转换
8. 增加依赖控制

## 1.3.7
1. 模板出错时的友好提示
2. 精简`mx-tag`配置
3. `encodeURIComponent`传递的`view-attr`参数，智能识别内置模板命令
4. `processContent`支持输出对象
5. 改进模板和`js`文件分析出错时的日志，提供周边代码，供快速定位

## 1.3.6
1. 支持对象属性`@`占位符
2. 支持`html`文件内获取编译后的选择器名称:`@:selector`
3. `md5`升级
4. 修复对象`key`为字符串的情况下输出`undefined`的`bug`

## 1.3.5
1. 依赖修改时编译对应的`js`文件
2. `html`压缩增加配置项
3. 固定依赖的版本号，避免依赖升级后结果和之前的不一样

## 1.3.4
1. 解决模板中不变变量的问题
2. 提高`@`文件的准确率
3. 加上`loader`后分析代码
4. 处理特殊的`tmpl`

## 1.3.3
1. 增加`Promise`的`reject`
2. 修复绑定`bug`
3. 彩色`log`
4. 路径转换可以禁用`useAtPathConverter`

## 1.3.1
1. 事件增加前缀

## 1.3.0
1. 改进数据`key`的识别
2. 修复替换内容有`$`的情况
3. 事件增加所属`view`前缀
4. 支持`view-attr`传递数据
5. 默认启用`updaterAndTmpl`

## 1.2.10
1. 改进模板变量解析
2. 模板增加`raw`前缀，不做任何处理

## 1.2.9
1. `excludeFileContent`选项，可根据文件内容决定是否排除
2. 增加`webpack`加载器

## 1.2.8
1. `outputTmplWithEvents`选项

## 1.2.7
1. 自带模板中自动识别数据key，自动识别刷新的标签
2. 修复自闭合标签无刷新`key`时，不再提供刷新信息
3. 局部刷新属性时换另外方案：存属性字符串，分析有哪些属性，更新时以分析到的属性为准
4. 增加`kissy`加载器

## 1.2.6
1. 修复`index.js`中`util.removeFileDepend`方法
2. `updater`绑定时，`checkbox`及`radio`需要在项目中处理
3. 修复跨文件压缩`css`时的问题，不能使用递增的方案，可能相同的选择器递增的值不同。使用`md5`，同内容同`key`
4. 更健壮的`css`处理，当存在内容读取时，不向全局对象添加选择器
5. 升级`md5`结果长度到`4`，因为选择器也要用
6. `css`文件中的`@`规则在启用选择器压缩的情况下也要压缩
7. 开放`css`中的背景图，`html`中的`img`标签路径处理
8. 修复内置模板`@`属性分析`class`在子模板中判断成`prop`的bug

## 1.2.5
1. 修复`.mx`文件中`css`路径问题
2. 修复`excludeTmplFolders`在单独处理文件内容时遗漏问题

## 1.2.4
1. 修复模板分析bug

## 1.2.3
1. 增加css文件中外链资源的处理
2. 增加模板中img标签的src属性处理
3. 预留对图片资源的加载，比如使用2倍图，加载webp格式等

## 1.2.2
1. 移除buildFolder，放在外部处理
2. 修改内置模板的压缩
3. 加入acorn分析模板代码

## 1.2.1
1. 针对requirejs修改amd打包方式
2. 修复标签内replace bug https://github.com/thx/magix-combine/issues/14

## 1.2.0
1. 代码重构，拆分子模块
2. 移除snippets
3. 增加mxtag处理

## 1.1.15
1. 删除onlyAllows配置项
2. combine及processFile promise化

## 1.1.14
1. 增加`.mx`后缀的支持
2. 增加`md5KeyLen`配置项

## 1.1.13
1. 依赖项明确版本，之前未明确版本，在某些情况下会出问题

## 1.1.12
1. 内置配置项：模板压缩等

## 1.1.11
1. 修复模板前缀漏掉的bug

## 1.1.10
1. 修复 outputTmplObject bug

## 1.1.7
1. 从html提取信息 https://github.com/thx/magix-combine/issues/12

## 1.1.6
1. 修复copyFile bug

## 1.1.5
1. 支持字符串内的css@命令替换 https://github.com/thx/magix-combine/issues/11

## 1.1.0
1. 删除 `@filename.css:$prefix`

## 1.0.8
1. 优化模板分析

## 1.0.5
1. 参考seajs require分析，更健壮的依赖分析