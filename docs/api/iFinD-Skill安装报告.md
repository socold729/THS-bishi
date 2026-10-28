# iFinD Skill 安装报告

日期：2026-10-27。用户明确请求按[官方安装指南](https://mcp.51ifind.com/gwstatic/static/ds_web/ifind-mcp-web/skills/SKILL_INSTALL_GUIDE.md)完成安装，并补充独立 iFinD MCP 密钥。

## 安装状态

| 项目 | 实际结果 |
|---|---|
| 技能版本 | ifind-finance-data 1.5.0 |
| 目录 | C:\Users\socold\.codex\skills\ifind-finance-data |
| 安装范围 | 当前 Codex 用户级技能目录；已实测存在，未发现同名旧版本，无覆盖安装 |
| 文件 | SKILL.md、call-node.js、call.py、mcp_config.json、skill_env_config.json、references 均存在 |
| 参考文档 | 实际有 11 个 Markdown 文件，指南总览写 8 个；以实际包为准 |
| 运行环境 | Node v24.22.1；Python 3.13.6；requests 2.34.2 |
| 密钥 | 已通过隐藏终端输入配置，JSON 序列化写入用户技能目录；读回校验通过，未写入产品项目或日志 |
| 请求环境 | 按 Skill 要求将 agent_name 配置为 codex |
| 官方代码 | 保持原样，没有改写官方库或跳过验证后声称通过 |
| 完整自检 | **未通过：出现超时** |
| 宿主识别 | 文件已安装；当前会话未宣称已动态加载，新一轮会话应能发现，若未显示可重启 Codex |

安装位置依据当前已存在的 Codex 自身技能目录及 skill-installer 默认路径；官方指南允许直接使用检测到的自身默认目录。其候选表中的其他目录实测均不存在，未向其他软件或项目安装。

技能指南与 ZIP 下载来源、校验摘要及脱敏安装结果见 [安装证据](../evidence/2026-10-27-ifind-skill-installation.json)。官方 ZIP 为 26,241 字节；未使用来源不明的包。

## 自检与诊断结果

1. Node 官方库 `listTools("stock")`：临时包装器 50 秒总超时退出，没有取得工具列表，记录为未通过。
2. Python 官方库 `list_tools("stock")`：10 秒 read timeout；按库实现，该时长对应初始化通知的等待，但没有据此假定通知已成功处理。
3. 独立 HTTP 认证诊断：initialize 返回 HTTP 200、服务 hexin-ifind-ds-stock-mcp 1.0.0、有 Mcp-Session-Id。证明密钥至少完成过一次授权初始化。
4. 后续独立协议诊断：该次 initialize 超时，初始化通知也超时；tools/list 随后返回 HTTP 200 和 10 个工具。由于该次没有有效 session header，不能把这组诊断称为完整会话成功。
5. 补做官方 Python 库自检，允许在已获得会话后对通知超时复用会话重试一次；该次在初始化阶段 30 秒 read timeout，尚未进入该重试分支。

上述结果证明安装文件和密钥配置已完成、服务曾成功响应认证/目录操作；不能宣称官方库完整调用流程稳定可用，亦未执行 iFinD 金融数据查询。超时原因尚未确定，不断言为密钥无效或供应商故障。

证据：

- [Node 自检超时](../evidence/2026-10-27-ifind-node-selfcheck-timeout.json)
- [Python 首次自检](../evidence/2026-10-27-ifind-skill-selfcheck.json)
- [授权初始化诊断](../evidence/2026-10-27-ifind-auth-connectivity.json)
- [协议诊断](../evidence/2026-10-27-ifind-protocol-diagnostic.json)
- [Python 复验](../evidence/2026-10-27-ifind-skill-selfcheck-retry.json)

临时自检脚本已按指南删除；官方安装文件及私有凭据保留在用户技能目录。后续应先复验官方自检，再按产品需求验证金融工具的参数、数据、来源与时点。若超时持续，可通过[官方使用指南](https://mcp.51ifind.com/#/documents/guide-prepare)排查；当前没有请求用户重复提供密钥的依据。

## 2026-10-28复查补充

通过原样官方Node库，新闻/公告及股票业务已完整走通并返回真实记录；先前“金融取数0/官方库均未通过”是历史状态。指数服务本次初始化连接重置，仍未取数；Python库未复测。新闻日期越界和公告原文URL缺失仍须校验。Web未接入该Skill；具体证据见MCP能力复查-2026-10-28.md，旧超时记录不删除。

## 2026-10-28安装来源再次核对

用户询问是否按原指定安装指南执行。再次实际下载该URL指南与其指定1.5.0 ZIP，SHA256分别为FCF915C20B4BF96A9E7688E2FBEEA08625BCCF35A1A3C2D807B030C7CC7622FD、EA7C60474CF0209F2DEA0A7EBBAD60B3517A83A97E506A118B297B0907EDC460，与2026-10-27安装证据完全一致。

逐字节哈希核对现有SKILL.md、call-node.js、call.py及11个references文档，共14个官方文件，全部与官方ZIP一致。配置文件不纳入原样比较，避免读取/展示私密密钥；没有覆盖已有安装或配置。指南允许采用实际检测到的当前智能体自身默认技能目录，本安装使用Codex用户级目录C:/Users/socold/.codex/skills/ifind-finance-data，当前会话也已识别该技能。

另按指南第6步通过临时脚本调用原样官方listTools(stock)，本轮返回SELFCHECK_ERROR: read ECONNRESET，记录为未通过，临时脚本已删除。此前新闻/公告/股票真实查询成功记录仍保留；不能因本次失败改称从未成功，也不能因文件一致就宣称所有服务稳定。

证据：2026-10-28-ifind-install-source-recheck.json、2026-10-28-ifind-guide-selfcheck.json。
