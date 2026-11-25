# dsh-tz-panel

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的 Windows 时区切换插件：在 **设置** 里多出一页「时区」，列出 Windows 全部 144 个时区、每行带实时时钟，点一下就切换系统时区。

不需要 DS Bot，不需要团队视图，不需要任何其它插件。

## 为什么不用 dsh-tz-switch

`dsh-tz-switch` 的侧栏入口只往 `[data-dsh-team-slot="sidebar"]` 这一个 DOM 锚点里插行，而那个锚点由 DS Bot 的侧栏补丁提供。没装 DS Bot 时 `mountTeamRow()` 直接 `return`，所以插件装好了、客户端也加载了，界面上却什么都没有——它的 README 只说「不用 DS Bot 可以忽略那步」，没说自己会彻底不可见。

这个插件改注册到 DSH 原生的 `settings.section` 槽位，那是设置外壳自己渲染的列表，任何 profile 都能看到。

## 安装

```bash
dsh plugin --profile <profile> add github:<owner>/dsh-tz-panel
```

本地开发时用目录链接：

```bash
dsh plugin --profile <profile> add link:D:/path/to/dsh-tz-panel
```

包声明了 `dsh.bundle.patch`，所以 DSH 会自己把它加进 `dsh.profile.bundles`，不需要手改 profile 的 `cordis.patch.yml`。装完 **完全退出并重启 DSH**（宿主半边不热更新），刷新页面。

## 使用

设置 → 时区。

- 顶部是当前时区和它的实时时钟（每秒走）。
- 搜索框可以按显示名、Windows 时区 ID 或 `UTC+8` 过滤。
- 点任意一行的「切换」，Windows 弹一次管理员确认（UAC）；确认后系统时区立即改变，取消则什么都不动。
- 列表每行显示该时区此刻的本地时间和 UTC 偏移。

时区读取每次都用一个新的 PowerShell 进程，因为常驻进程会缓存 `TimeZoneInfo.Local`，重启前一直报旧值。切换走的是 `tzutil /s`，本身需要管理员令牌，所以只能经 UAC 提权，插件不会静默提权。

## 开发

```bash
node scripts/smoke.mjs        # 宿主半边：路由、时区目录、参数校验（只读，不会改时区）
node scripts/smoke-client.mjs # 客户端半边：模块 id、注入、settings.section 注册
```

两个脚本用 `node` 直接跑即可；`lib/` 里是手写的普通 JS，没有构建步骤。

结构：

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半边。cordis 插件，在 `/api/tz-panel` 上提供 `GET`（当前时区 + 目录）和 `POST`（切换）。 |
| `lib/client.js` | 网页半边。`window.__ModuleLoader__.load` 模块，注册 `settings.section` 一节。 |
| `cordis.patch.yml` | bundle 补丁，把插件插进 Loader 配置树。 |
| `scripts/` | 两半边的冒烟测试。 |

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-tz-panel
```

## License

MIT
