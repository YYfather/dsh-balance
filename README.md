# dsh-balance

DeepSeek Harness 余额与开销插件。在对话底部状态栏（composer dock）显示 DeepSeek / MiMo 账户余额与话费开销，支持**逐请求计价**、**高峰/空闲分时段**、**多模型价目**与**花费超线提醒**（点击状态栏即可设置）。

> 📦 已发布 npm：`@yyfather/dsh-balance`（npm registry，可一键安装）

## 功能

- **余额**：实时查询 DeepSeek 账户余额（仅本机可访问，密钥只存在于 Host 侧；当前会话为 MiMo 等外部模型时不显示 DeepSeek 余额）
- **开销（逐请求精确计价）**：按每个请求时间戳选高峰/空闲档价、按该请求的模型选价、同一步骤的 usage 样本按官方投影替换规则去重
  - `本会话` = 当前会话从创建至今的全部花费
  - `本次活跃` = 自本次插件启用以来新产生的花费
  - `最近一次` = 当前会话最新一步请求的花费
  - `上次对话` = 当前会话之前的上一会话花费（MiMo 会话按小米美元价 × 汇率折算）
- **多模型价目**：内置 DeepSeek V4 Flash / V4 Flash Vision Exp / V4 Pro（官方价，空闲/高峰双档）与小米 MiMo V2.5 系（美元价），可在点击面板中按模型+时段编辑，美元模型按可配置汇率换算
- **提醒**：本次活跃花费 ≥ 提醒线（默认 ¥1）时状态栏变橙色徽标；DeepSeek 余额 < 提醒线（默认 ¥10）同样提醒；点击面板可改两线
- **刷新**：每次对话结束后自动刷新 + 每 5 分钟自动刷新（可在面板中开关）

## 安装

### 方式一：插件市场一键安装（推荐）

市场（设置 → 插件市场）中出现本插件后，在**可安装**页点击卡片即可走 DSH 官方的受管安装（npm 身份校验 + 安全快照 + 重启验证）。

### 方式二：手动安装

1. 克隆仓库到 DSH 的 profile 依赖目录（`%USERPROFILE%\.dsh\profiles\node_modules\@yyfather\dsh-balance` 或你的 `$DSH_HOME/profiles/<name>/node_modules/@yyfather/dsh-balance`）：
   ```sh
   git clone https://github.com/YYfather/dsh-balance.git "$USERPROFILE\.dsh\profiles\node_modules\@yyfather\dsh-balance"
   ```
2. 在 profile 的 `cordis.patch.yml` 末尾追加（该文件是用户 patch 层，重装/升级不会覆盖；`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`）：
   ```yaml
   - insert:
       - id: dsh-balance
         name: '@yyfather/dsh-balance'
   ```
3. 重启 DSH Desktop。状态栏底部即出现余额/开销一行；点击可打开设置面板。

### 依赖

- Host 侧：`webServer`、`credentials`（DeepSeek 密钥在 设置→模型 保存，默认引用 `DEEPSEEK_API_KEY`）、`sessions` / `sessionQuery`（会话与历史投影）、`timer`
- Client 侧：`slots`（`conversation.composer.dock`）、React
- Node ≥ 20（Host 使用原生 `fetch`）

## 配置（Host `cordis.patch.yml` 行内可覆盖）

| 字段 | 默认 | 说明 |
|---|---|---|
| `apiKeyRef` | `DEEPSEEK_API_KEY` | 余额查询所用凭据引用 |
| `baseUrl` | `https://api.deepseek.com` | DeepSeek API 根地址 |
| `timeoutMs` | `20000` | 上游查询超时 |
| `allowRemote` | `false` | 不允许非本机访问插件路由（安全默认，勿随意外开） |

运行时价格/提醒线在点击面板中修改（进程内生效）。

## 安全

- 密钥仅在 Host 侧解析，浏览器端只访问 `dsh-balance/api/*` 本机同源路由（默认拒绝本机以外的来源）
- 路由响应不含任何上游原文、密钥或未经校验的字段

## License

MIT
