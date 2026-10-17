# Grok Build Desktop

Grok Build 的桌面 Agent 客户端。**不重新实现模型调用**，而是通过 [ACP（Agent Client Protocol）](https://agentclientprotocol.com) 驱动你本机已经装好的终端版 Grok Build —— 登录态、模型、工具链、会话历史、记忆、插件全部直接复用。

```
┌──────────────────────────────┐
│  Electron 渲染进程（React）   │  聊天流 / 思考 / 工具卡片 / 计划
└──────────────┬───────────────┘
               │ IPC（contextBridge）
┌──────────────▼───────────────┐
│  Electron 主进程             │  AcpClient：JSON-RPC over stdio
└──────────────┬───────────────┘
               │ spawn `grok agent stdio`
┌──────────────▼───────────────┐
│  终端版 Grok Build           │  复用 ~/.grok 下全部配置
│  auth.json / models / tools  │
└──────────────────────────────┘
```

## 为什么用 ACP 而不是直接调 HTTP

终端版内置了 ACP 服务器（`grok agent stdio`），它已经封装好了：

- **认证**：自动读取并刷新 `~/.grok/auth.json` 里的 OIDC 令牌
- **模型路由**：`cli-chat-proxy.grok.com`、模型清单、推理强度
- **工具链**：文件读写、命令执行、检索、子 Agent、MCP、Skills
- **会话与记忆**：transcript 持久化、`session/load` 恢复、跨会话记忆

自己接 HTTP 等于把这些重写一遍，而且会随版本漂移。走 ACP 则天然跟随终端版升级。

## 前置条件

1. 已安装终端版 Grok Build（存在 `~/.grok` 目录）
2. 已完成登录：`grok login`（桌面端会复用该登录态）

## 快速开始

### 方式一：安装包（推荐）

**Windows**

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| 免安装版 | `dist/win-unpacked/Grok Build Desktop.exe` | 双击即用，免安装。整个 `win-unpacked` 目录需保持完整，可整体拷贝到别处 |
| 安装包 | `dist/Grok Build Desktop Setup <版本号>.exe` | 双击安装，可自选安装目录，生成开始菜单快捷方式 |

> 首次运行若被 Windows SmartScreen 拦下（应用未做代码签名），点「更多信息」→「仍要运行」。

**Linux（Debian / Ubuntu）**

```bash
npm run dist:linux          # 产出 dist/grok-build-desktop_<版本>_amd64.deb
npm run install:linux       # sudo/pkexec 安装到系统，写入应用菜单
```

安装后可在应用菜单搜索「Grok Build Desktop」，或命令行执行 `grok-build-desktop`。  
卸载：`sudo apt remove grok-build-desktop`。

### 方式二：从源码运行

```bash
npm install
npm run dev
```

也可以直接双击项目根目录的 `dev.cmd`（已内置下面提到的环境变量处理），它会以开发模式启动并支持热更新。

首次启动会自动做环境自检，并连接 agent。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式（热更新） |
| `npm run build` | 构建到 `out/` |
| `npm start` | 预览构建产物 |
| `npm run typecheck` | 主进程 + 渲染进程类型检查 |
| `npm run pack` | 打包免安装版到 `dist/win-unpacked/`（Windows） |
| `npm run pack:linux` | 打包免安装目录到 `dist/linux-unpacked/` |
| `npm run dist` | 打包成 Windows 安装包（输出到 `dist/`） |
| `npm run dist:linux` | 打包成 Linux `.deb`（输出到 `dist/`） |
| `npm run install:linux` | 把刚打好的 `.deb` 安装到本机（进应用菜单） |
| `npm run sync-app` | 把打包产物同步到免安装绿版 `app/`（自动检测运行态、成对校验） |
| `npm run deploy` | 等价于 `pack` + `sync-app`，一步出绿版（Windows） |

## 版本管理

版本号语义为 **主版本.次版本.修订号**：修 bug 升修订号，新增功能升次版本号，不兼容改动升主版本号。

**每次改动功能都会自动升一次版本号**，由脚本统一维护，不手工改 `package.json`：

```bash
npm run version:show                          # 查看当前版本与最近变更
npm run version:patch -- "修复了xxx"          # 0.2.0 → 0.2.1
npm run version:minor -- "新增了xxx"          # 0.2.0 → 0.3.0
npm run version:major -- "重构了xxx"          # 0.2.0 → 1.0.0
```

脚本（`scripts/version.mjs`）会同步更新 `package.json`、`package-lock.json`，
并在 `CHANGELOG.md` 顶部插入一条变更记录。加 `--commit` / `--tag` 可顺带提交并打标签。

应用内查看版本：点击左下角状态栏最下方的版本号，打开「关于」面板，其中包含
版本号、**构建时刻**、Grok Build 版本与运行环境。构建时刻能区分「同一版本号的两次不同构建」，
反馈问题时请一并附上。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `GROK_BIN` | 指定 grok 可执行文件路径（默认自动查找 PATH 与 `~/.grok/bin`） |
| `GROK_HOME` | 指定配置目录（默认 `~/.grok`） |
| `ELECTRON_MIRROR` | Electron 二进制镜像。国内网络建议设为 `https://registry.npmmirror.com/-/binary/electron/`（已在 `.npmrc` 中配置） |

## 链路自检

应用内点左下角状态栏 → **环境自检**，会检查可执行文件、配置目录、版本、登录态与令牌有效期、模型清单、模型服务连通性。

命令行下也可以直接验证 ACP 链路：

```bash
node scripts/acp-probe.mjs
```

它会执行完整的 `initialize → session/new → session/prompt` 流程并打印事件流。若这一步没有文字输出，问题在网络或登录态，而不在桌面端。

## 网络代理（重要）

grok 的模型服务在境外（`cli-chat-proxy.grok.com`）。**grok 只读 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量，不读 Windows 系统代理设置**——所以即使系统里开着代理，桌面端也可能连不上。

典型表现：

- 左下角状态栏显示「已就绪」，但发消息后没有回复
- 环境自检里「模型服务连通性」为**异常**、「网络代理」为**注意（未配置）**

解决：点左下角状态栏 → **环境自检** → 「自动探测」（自动扫描本机常见代理端口），或手动填写代理地址后「保存」。保存后应用会自动重启 agent 使配置生效。

常用代理地址：

| 代理客户端 | 地址 |
| --- | --- |
| v2rayN / Xray | `socks5h://127.0.0.1:10808` |
| Clash | `http://127.0.0.1:7890` |
| Clash Verge / Mihomo | `socks5h://127.0.0.1:7897` |

配置存在应用的 `userData/config.json`，与终端版 grok 的配置互不干扰。

> 应急做法：若暂时不想改配置，也可在启动前设好环境变量，子进程会继承：
> ```cmd
> set HTTPS_PROXY=socks5h://127.0.0.1:10808
> set HTTP_PROXY=socks5h://127.0.0.1:10808
> "Grok Build Desktop.exe"
> ```

## 开发者文档

面向 AI 编码助手的项目架构、约定与已知坑，见根目录 [`AGENTS.md`](AGENTS.md)（Agent 工具会自动读取）。

## 功能

- 流式输出、思考过程折叠展示
- 工具调用卡片：标题、内部工具名、状态、输入输出、涉及文件
- 执行计划面板
- 会话列表，支持切换与恢复（走 ACP `session/load`）
- 模型 / 推理强度切换（读 `session/new` 返回的 `configOptions`）
- 自动批准开关：关闭后每次工具执行都会弹出确认
- 工作目录选择（Agent 以该目录为根开展工作）
- 用量统计（token / 成本）
- 系统托盘：三态图标（绿=已连接 / 黄=连接中或断开 / 红=错误），关闭窗口最小化到托盘，托盘菜单可显示窗口或退出

## 安全说明

- 渲染进程开启 `contextIsolation`、关闭 `nodeIntegration`，仅通过 preload 暴露白名单 API
- 外部链接仅允许 `http/https`
- Agent 子进程随应用退出而终止

## 目录结构

```
src/
├── main/                  主进程
│   ├── acp/client.ts      ACP JSON-RPC over stdio 客户端
│   ├── acp/service.ts     会话服务（进程管理、权限、配置）
│   ├── diagnostics.ts     环境自检
│   ├── ipc.ts             IPC 注册
│   └── index.ts           应用入口
├── preload/               contextBridge 桥接
├── renderer/              React 界面
└── shared/                三端共享类型与通道常量
```
