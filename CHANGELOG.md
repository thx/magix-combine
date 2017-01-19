##1.2.10
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