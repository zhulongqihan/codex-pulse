# Pulse portable-profile patch

This is the original `tauri-plugin-single-instance` 2.5.5 crate from the Tauri
plugins workspace, licensed under `Apache-2.0 OR MIT`. Both original licenses
are preserved. Source: <https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/single-instance>.

Original SHA-256:

- `src/lib.rs`: `b1f2ae5569f04b1266b3c2293596476c37572373d11a4789e188af9fc274fbe2`
- `src/platform_impl/windows.rs`: `cc625cd4bb9f8bcccdba389b489f8c1971a0fe3a2d11f1a36fbdcb9766399b54`

The only adaptation adds `Builder::windows_key` and passes that optional key
to the existing Windows implementation. Pulse supplies a SHA-256 fingerprint of
its canonical portable data directory. This gives each profile its own original
plugin mutex/message window without changing the application's bundle identifier.
The default behavior for other callers and other platforms remains unchanged.

Windows forwarding, its concurrent-launch retry, foreground permission transfer,
and resource cleanup remain the original plugin implementation.
