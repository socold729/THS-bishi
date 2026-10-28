# 界面截图

以下图片来自2026-10-28实际执行的隔离浏览器测试。所有行情、股票名称、财务数字、笔记和模型结果均为测试构造输入；`EXPLICIT_MODEL_MOCK`不是实际模型。截图只用于展示界面及交互，不能证明真实金融分析或实际监管触发。

| 图片 | 展示内容 | 来源 |
|---|---|---|
| [桌面每日复盘](dashboard-mock-desktop.png) | 日历、K线、笔记同步与异动条件卡 | market-refine.spec.ts，明确Mock |
| [移动端每日复盘](dashboard-mock-mobile.png) | 手机布局及笔记/提醒 | 同上，明确Mock |
| [复盘档案](archive-mock-desktop.png) | 主动保存、版本及旧配置快照 | increment.spec.ts，明确Mock |
| [价值工作区](value-mock-desktop.png) | 财务三表、估值片段和自设条件 | value-review.spec.ts，明确Mock |

原图由Playwright生成并已逐张视觉检查。复制到此目录作为项目交付截图，没有上传`.cache`目录中的其他图片，尤其没有上传真实报告截图或用户浏览器数据。
