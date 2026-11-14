# Production candidates / 生产候选构建

The **Production candidate** Actions workflow is manual. Supply a complete 40-character source commit. Its gate requires the latest exact-source **Checks** run from a `main` push to have completed successfully, and rejects versions with an existing Release. Target source is checked out only after this gate; gate tooling is separately pinned to the workflow's own commit.

It builds a release-mode Windows executable without e2e features using locked dependencies. The run uploads the EXE, portable ZIP, their SHA256 files and `candidate-build.json` in a uniquely named artifact. The metadata binds the source and workflow commits, successful Checks run, build run, tool versions, PE version, artifact digests and observed Authenticode status. The ZIP must contain only the expected portable files and the identical executable.

These are **unsigned candidates**, not formal releases. The workflow does not use the local update-signing key, create tags, publish releases, install the app or claim user adoption. An Actions artifact may require GitHub sign-in and expires after its retention period. Normal users should use [formal Releases](https://github.com/zhulongqihan/codex-pulse/releases/latest).

An approved candidate still needs package verification, actual installation and data-retention checks, update-manifest signing, release review and post-publication download/upgrade verification before a formal release. Metadata links a build to its source; it is not a cryptographic attestation, a bit-for-bit reproducibility guarantee, an independent security audit or an Authenticode publisher signature. A later signing service must review eligibility and integration separately.

**中文：**“Production candidate”工作流仅手动运行，输入完整40位源码提交。门禁要求该SHA最新一次来自`main`推送的Checks成功，并拒绝已有Release的版本。门禁工具固定到工作流自身提交；通过后才检出目标源码，用锁定依赖构建无e2e功能的生产模式程序。

单次产物包含EXE、便携ZIP、两份SHA256和绑定源码/工作流/CI/工具版本的元数据，明确记录未进行Windows发布者签名。它不读取本地更新私钥、不创建标签、不发布或安装。正式交付仍需按项目流程验包、验安装保数据、签名更新清单、审查与发布后升级验证；普通用户请使用正式Release。构建元数据不等于安全审计或Windows发布者认证。
