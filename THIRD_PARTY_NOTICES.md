# Third-party notices

## Feature inspiration

Codex Pulse uses its own implementation and visual identity. These projects informed the combination of a small usage companion and a detailed local dashboard; they are acknowledged as inspiration, not vendored source code:

| Project | License and copyright | Reference reviewed |
|---|---|---|
| [asetho/ChatGPT-Usage](https://github.com/asetho/ChatGPT-Usage) | MIT; Copyright (c) 2026 asetho™ | [v1.0.33 LICENSE](https://github.com/asetho/ChatGPT-Usage/blob/v1.0.33/LICENSE) |
| [itvincent-git/codex-usage-desktop](https://github.com/itvincent-git/codex-usage-desktop) | MIT; Copyright (c) 2026 vincent | [app-v5.6.0 LICENSE](https://github.com/itvincent-git/codex-usage-desktop/blob/app-v5.6.0/LICENSE) |

If a future contribution incorporates substantial source from another project, it must add the applicable original copyright and license text here before distribution. Acknowledgment alone does not satisfy a copied code's license conditions.

## Dependencies

Electron, Chromium, Node.js, React, Vite, and other dependencies are distributed under their respective licenses. Release packaging must preserve their accompanying license and notice files. The root MIT license covers Codex Pulse's own code; it does not relicense third-party software.

The renderer bundles React 19.3.1, React DOM 19.3.1, Scheduler 0.28.0 (MIT), and Lucide React 1.69.0 (ISC). Their original license texts are collected in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt), which is copied into the portable distribution. If these dependencies change, regenerate that file from the versions in the lockfile. Electron's accompanying `LICENSE` and `LICENSES.chromium.html` remain separate and must also be retained.

## Names and artwork

OpenAI, ChatGPT, and Codex are names belonging to their respective owners. Codex Pulse is not affiliated with or endorsed by OpenAI.

The `asetho` brand and upstream artwork are not reused. In particular, the MIT license of ChatGPT-Usage does not grant a license to the OpenAI knot. See that project's [trademark statement](https://github.com/asetho/ChatGPT-Usage/blob/main/TRADEMARKS.md).

Project screenshots and demonstrations must contain synthetic data only. They must not reuse an actual user's account details, sessions, or private project names.
