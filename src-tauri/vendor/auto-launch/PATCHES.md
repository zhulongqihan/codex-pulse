# Codex Pulse compatibility patch

This directory contains `auto-launch` 0.6.0, from the crates.io release of
[zzzgydi/auto-launch](https://github.com/zzzgydi/auto-launch), under its original MIT license.
The original Windows source has SHA-256
`e612190b30216ff713a0268cf7d2377e41db0072b52c287721d36ab9dc501f64`.

The Windows `Run` command now quotes the executable path before appending the existing
startup arguments. This preserves portable installation directories containing spaces
or Unicode, and leaves the existing enable, disable, and Task Manager state behavior intact.
The pure command construction test does not modify registry entries.

Cargo selects this source through the application's `[patch.crates-io]` entry.
