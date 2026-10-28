# 显式外发流程

仅当用户明确要求发送当前日期、当前完整版本时读取本文件。定时触发、生成草稿、保存 Notion、一般确认或过期确认均不授权外发。

## 提交前

- 明确用户批准的日期和完整版本；存在多份待确认稿时先消除歧义。
- 核实发送身份、鉴权配置和目标会话，确认该身份能被 Hermes 归属为王伟。
- 缺少鉴权或身份归属不明时保留已确认稿并提供可复制全文，不报告已发送。

## 飞书消息接口

- `POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`
- `receive_id`: `oc_77018198b19b150a3c9c33fc8493bb49`
- `msg_type`: `text`
- `content`: 通过 JSON 序列化得到的字符串 `{"text":"已确认的日报全文"}`
- 使用 `Authorization: Bearer <access_token>`；令牌及应用密钥只从用户指定的安全配置读取，不写入技能、状态文件或日志。

使用 JSON 序列化构造内外两层，保留中文和换行。普通群 Webhook 不替代该接口。

## 幂等与结果

- 状态文件：`D:/Developer/daily-work-log/state/YYYY-MM-DD.json`
- 记录日期、完整稿件版本、确认时间、发送状态、返回消息标识及 Hermes 回应。
- 状态区分：`pending_confirmation`、`confirmed`、`sent`、`accepted`、`send_unknown`、`failed`。
- 当前版本已有 `sent` 或 `accepted` 时不重复发送；内容变化且已发送时，由用户决定补充或更正。
- 超时或结果未知时先检查目标会话，不盲目重发。
- 只有 Hermes 回复明确确认收录时报告“已收录”；否则报告“消息已发送，收录待确认”。
