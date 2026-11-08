# 版本与兼容性 / Versioning and compatibility

## 中文

Codex Pulse 使用 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)，提交说明遵循 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/)，版本记录参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。这是项目采用的工程约定，不是第三方认证声明。

当前软件处于 `0.x` 阶段。版本格式固定为 `主版本.次版本.修订号`：

| 改动 | 版本示例 |
|---|---|
| 兼容的问题修复、安全修正、已有功能的体验修复 | `0.4.0` → `0.4.1` |
| 新功能、明显扩展的能力 | `0.4.x` → `0.5.0` |
| `0.x` 阶段的不兼容变更 | 提升次版本，明确变更与迁移方式 |
| 建立稳定兼容性承诺 | 发布 `1.0.0`；之后不兼容变更提升主版本 |
| 仅贡献文档、测试或工程工具，未修改交付程序 | 保留软件版本，通过独立提交记录 |

兼容性关注持久数据、偏好、便携启动方式与已文档化的导出内容。缓存重建不能删除原始 Codex 日志；数据迁移必须保留备份和恢复路径。内部缓存结构和未公开的进程接口不是稳定公共 API。

目前生产更新器仅接受稳定的 `X.Y.Z`。不要把 `beta`、`rc` 或构建元数据版本放入生产更新清单或 latest 发布。

### 修改版本

`package.json` 是版本的主来源。使用同一命令更新 Tauri、Rust 和锁文件，避免手工漏改：

```powershell
pnpm version:check
pnpm version:bump patch --dry-run
pnpm version:bump patch
# 新功能使用 minor；也可以指定明确的新版本。
pnpm version:bump minor
```

命令不会自动提交、创建标签或发布。代码和文档仍需正常审查。发布前在 `CHANGELOG.md` 中整理使用者可理解的变化，并准备 `docs/releases/vX.Y.Z.md` 中英说明。

### 发布约定

1. 完成相关实现、验证和文档，再确定最终版本。
2. 版本一致性、工具测试、类型检查、前端和 Rust 测试必须通过；桌面和界面修改还需原生流程、两版外观及受影响窗口尺寸的验证。
3. 发布候选必须对应同一个源码提交、成功的 GitHub Checks、版本标签和发行包。正式发布前验证生产包、签名及升级时的数据保留。
4. Git 标签使用 `vX.Y.Z`，每个软件版本对应唯一源码与公开资产。已发布版本不改内容、不移动标签、不替换同名资产；问题通过新版本修复。
5. Release 提供中英说明、Windows ZIP、独立更新 exe、各自 SHA-256 和签名更新清单。验证下载后的文件，再发布演示和使用文档。
6. 更新现有安装前正常退出、备份、保留 `data`；替换后验证版本、启动入口和偏好，保留恢复能力。
7. 每轮完成前，从新用户视角复查主流程、可发现性、焦点／键盘、失败状态与受影响的清爽／刻度布局；修复确认的问题后重验。发布后再核对公开下载、更新与演示入口。复查无须修正时如实记录，不为“迭代一遍”制造无意义变更。
8. 欢迎通过 [Issues](https://github.com/zhulongqihan/codex-pulse/issues) 和 [Discussions](https://github.com/zhulongqihan/codex-pulse/discussions) 反馈。处理后在原反馈中关联修复提交／发布版本，版本说明记录真实贡献；内部审计、计划与逐项验收仅本地保留。

## English

Codex Pulse follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), and the structure of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). These are project conventions, not a claim of third-party certification.

The application is currently in `0.x` development:

| Change | Example |
|---|---|
| Compatible bug, security, or existing-workflow fixes | `0.4.0` → `0.4.1` |
| New features or substantial capability additions | `0.4.x` → `0.5.0` |
| Incompatible changes during `0.x` | Increase the minor version and document migration |
| Established stable compatibility contract | Release `1.0.0`; subsequent breaking changes increase the major version |
| Contribution documentation, tests, or tooling without a shipped application change | Keep the application version and record a separate commit |

Compatibility covers persistent data, preferences, portable launch behavior, and documented exports. Cache recovery must not delete original Codex logs. Data migrations require a backup and recovery path. Internal cache layouts and undocumented process interfaces are not stable public APIs.

The production updater currently accepts stable `X.Y.Z` versions only. Do not publish prerelease or build-metadata versions to its manifest or latest release.

Use `pnpm version:check`, `pnpm version:bump patch --dry-run`, and `pnpm version:bump patch` (or `minor` / an explicit new version). `package.json` is authoritative; the command synchronizes Tauri, Rust, and the application entry in Cargo.lock. It does not commit, tag, or publish. Maintain user-facing changes in `CHANGELOG.md` and bilingual notes in `docs/releases/vX.Y.Z.md`.

Before release, pass version checks, tooling tests, type checks, frontend and Rust tests, plus relevant native, visual, and window-size checks. The source commit, successful GitHub Checks, version tag, and production package must agree. Verify production packaging, signatures, and upgrade data preservation before publication.

Use immutable `vX.Y.Z` tags and release assets. Never retag or overwrite a published release; ship a new version for corrections. Publish bilingual notes, the Windows ZIP, update executable, both SHA-256 files, and the signed update manifest. Download and verify the public files. Before updating an existing installation, exit normally, back up, retain `data`, and verify its version, launch entries, and preferences afterward.

Before completing each iteration, review discovery, the main user workflow, focus/keyboard behavior, failure states, and affected Clear/Meter layouts from a new user's perspective. Correct confirmed problems and rerun the affected checks. After publication, verify public downloads, the updater, and demonstration links. Record a review that requires no corrections honestly; a review is not a reason to manufacture changes.

Feedback is welcome through [Issues](https://github.com/zhulongqihan/codex-pulse/issues) and [Discussions](https://github.com/zhulongqihan/codex-pulse/discussions). Link addressed feedback to its fixing commit or published version and credit actual contributions in release notes. Internal plans, audits, and detailed acceptance evidence remain local.
