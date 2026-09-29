# 插件协议

只改 `plugins/<id>`。禁止发明 API。禁止 exec/spawn/child_process/file://。

- 主题 / 播放器 / 启动器：在工作台「模板」用表单与画布，点「上线」进工坊
- MCP：到工作台「连接」页用模版或表单直连
- 知识库：用「知识库」轨导入，主聊天检索

创建时冻结 template，改 `plugin.json.template` 无效。禁止 contributes.webviews。只允许工作台新建模板。
