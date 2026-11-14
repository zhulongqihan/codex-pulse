# Security and privacy

For user-facing download, data-access and publisher-signature information, see [Downloads, data access and signatures](docs/TRUST.md#english).

## Reporting a vulnerability

Use this repository's **Security → Report a vulnerability** option when private vulnerability reporting is available. If it is unavailable, open a minimal issue requesting a private contact method; leave exploit details and private data out of the public issue.

Include the application version, operating system, affected component, impact, and a small reproduction using synthetic data. Do not attach credentials, raw session logs, an authentication file, or an unreviewed diagnostics archive.

Only the latest published version is targeted for fixes. No response-time guarantee or independent security audit is claimed.

## Data boundaries

- Original Codex session logs are read-only. Codex Pulse writes its own aggregate cache and preferences.
- Account capacity is queried from official account endpoints in Rust using the existing local ChatGPT sign-in. Codex retains responsibility for sign-in and token renewal.
- Credentials must never be exposed through renderer IPC, export files, application screenshots, or release assets.
- Codex Pulse adds no analytics or telemetry. Account refreshes contact OpenAI; optional reset information and model prices use their displayed third-party sources.
- Local history and official account limits are separate sources. Missing or stale data must remain visibly unavailable, not silently become zero.

## Safe issue reports

Session files can contain prompts, tool results, local paths, and personal information. A file named like a usage log is not automatically safe to share.

Before reporting a problem, review screenshots and attachments for email addresses, account identifiers, private project names, tokens, and conversation content. Prefer the smallest synthetic fixture that reproduces a parser issue. Never post `auth.json` or an entire `.codex` directory.

## Contribution requirements

Keep credentials in the Rust process, expose a narrow Tauri capability surface, and open external URLs only through explicit HTTP/HTTPS actions. Do not execute recorded tools or shell text from replay content. Do not add a credential-upload endpoint, remote conversation collection, or authentication shortcuts.

Portable updates require a manifest signed by the Pulse release key, an exact product/platform match and a verified SHA-256 package digest. The updater preserves the data directory and restores the prior executable when startup fails. Signing private keys are never included in the source or distribution.

Changes affecting parsing, caching, IPC, exports, authentication integration, or file access need tests for their relevant boundary conditions. Release verification must inspect both Git-tracked files and packaged artifacts for private data.
