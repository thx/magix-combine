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