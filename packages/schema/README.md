# @labelhub/schema

LabelHub 共享 schema 包，用于沉淀动态模板、数据导入校验和结构化输出相关的稳定约束。

当前导出：

- `templateSchemaVersion`
- `supportedDatasetFormats`

新增 schema 时，需要保证前端渲染、后端校验和导入导出链路使用同一套字段语义。
