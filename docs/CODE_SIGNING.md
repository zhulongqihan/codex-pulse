# 代码签名政策 / Code signing policy

[中文](#中文) · [English](#english) · [下载说明](TRUST.md) · [隐私](../PRIVACY.md)

## 中文

Codex Pulse 的当前正式 Windows EXE 尚无 Authenticode 发布者代码签名。不要因为看到 `.sha256` 或更新验证成功，就认为 Windows 已确认发布者身份。

请从 [zhulongqihan/codex-pulse 正式 Release](https://github.com/zhulongqihan/codex-pulse/releases/latest)下载。项目源码与发布由 GitHub 维护者 [zhulongqihan](https://github.com/zhulongqihan) 负责；源代码、版本说明和依赖署名公开在同一仓库，贡献方式见 [CONTRIBUTING](../CONTRIBUTING.md)。

- Release 的 `.sha256` 文件用于比较下载字节摘要。
- Pulse 自有更新器使用内置公钥验证 Ed25519 更新清单，再核对产品、平台、版本、下载地址、包长度和 SHA-256；只有通过后才进入更新流程。该签名不是 Windows Authenticode。
- 已发布的版本标签与资产保持不可变；交付内容改变时使用新版本，不覆盖旧版本包。

目前没有为发行 EXE 配置 Windows 发布者代码签名服务。有关下载文件的来源与完整性，请结合正式发布标签、版本说明、包摘要和更新验证机制核对；维护者不会要求用户关闭系统防护来运行程序。

签名状态应以具体下载文件的 Windows 数字签名属性及相应版本说明为准。有签名不等于独立安全审计，也不保证设备不会显示警告；请遵守设备和组织的防护策略。数据访问与外部服务说明见[隐私政策](../PRIVACY.md)，问题报告方式见 [SECURITY](../SECURITY.md)。

## English

The current released Windows EXE for Codex Pulse has no Authenticode publisher signature. A matching `.sha256` or a successful Pulse update check does not establish Windows publisher identity.

Download from the [zhulongqihan/codex-pulse formal Releases](https://github.com/zhulongqihan/codex-pulse/releases/latest). GitHub maintainer [zhulongqihan](https://github.com/zhulongqihan) is responsible for the project's source and releases. Source, release notes and dependency attribution are public in that repository; see [CONTRIBUTING](../CONTRIBUTING.md).

- Release `.sha256` files let you compare downloaded byte digests.
- Pulse's updater verifies an Ed25519 manifest with an embedded public key, then checks product, platform, version, download address, package size and SHA-256 before proceeding. This is separate from Windows Authenticode.
- Published version tags and assets are immutable. Changed delivery bytes require a new version rather than replacement of an old package.

No Windows publisher code-signing service is currently configured for the released EXE. Check the formal release tag, release notes, package digest and update verification to assess its origin and integrity. The maintainer will not ask users to disable system protection to run the program.

Check the Windows digital-signature properties of the particular file and that release's notes for its signature status. Signing does not constitute an independent security audit or guarantee that a device displays no warning. Follow your device and organization protection policies. See the [privacy policy](../PRIVACY.md#english) for data access and external services, and [SECURITY](../SECURITY.md) for reporting.
