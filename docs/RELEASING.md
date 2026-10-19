# Release procedure / 发布流程

Release packages are built with the repository's committed `lib/`, not on the user's machine. The workflow creates a **draft**; publishing is a separate step after package/UI acceptance. Do not replace published assets or move published tags.

## Prepare

1. Update `package.json`, the root version in `package-lock.json`, both READMEs, `CHANGELOG.md`, and the versioned release notes under `docs/releases/`.
2. Run build and tests separately. Keep the committed build current. Verify the package through `npm run release:pack -- --out /absolute/new/output` and `npm run test:install -- --package /absolute/new/output/dsh-ssh-remote-VERSION.tgz`.
3. For upgrade/rollback checks, pass `--previous /absolute/dsh-ssh-remote-0.11.0.tgz --previous-version 0.11.0`. Use `--keep` to retain the isolated installed profile for Web UI checks; the script prints its `home`. Evidence and test profiles stay in temporary directories, never in a user profile. They can be removed after checking the report.
4. Capture documentation screenshots using an isolated test workspace; never commit real conversation history or credentials. Render both READMEs and verify their local links.

For 0.11.0, keep v0.10.2 immutable. The helper changes to 0.11.0; pin the reviewed combined asset hash in the pack validator. Preserve transfer manifest v1 and check actual old-package resume. No automatic SSH migration is allowed in acceptance; configuration writes use private fixtures.

For 0.11.1, preserve both tags and the existing helper hash. Run real fish login-shell regressions (CI requires fish instead of silently skipping them), remote skills through the public registry and helper, and the directory-picker interaction tests. The Windows job is targeted path/registry coverage, not a full Desktop/SSH acceptance claim.

Keep the release build pinned to the oldest supported SDK. `node scripts/check-dsh-sdk.mjs 0.2.1-rc.2` installs the newer SDK into a temporary source copy and checks Host/Client types plus the full suite without changing the source lockfile. Package-install CI covers both DSH versions on macOS/Linux and Node 22/24. For an independent newer CLI use `--dsh /absolute/path/to/dsh --dsh-version 0.2.1-rc.2`; never upgrade the user's global CLI just to run acceptance. The v0.10.2 rollback package is validated on DSH 0.2.0-rc.2, not the newer prerelease.

## Draft and publish

For 0.12.0 updates, keep v0.11.2 immutable and use it as the package-lifecycle rollback point. In addition to normal archive tests, exercise the update button in isolated Web/Desktop profiles. Before a new stable release exists, `node scripts/prepare-update-smoke.mjs --package /absolute/candidate.tgz --base 0.11.2 --out /absolute/new/probe` creates a **private prerelease fixture containing the candidate updater**. Only its manifest version changes, allowing the real public 0.11.2 release to be offered. Never publish this fixture or claim that public 0.11.2 contained the updater. After publishing 0.12.0, repeat with `--base 0.12.0` and install the actual public 0.12.0 archive through the update button. Check installed version, running code, restart-required outcomes, retained workspace mappings and normal remote/local operations separately.

1. Merge the reviewed change into `main` after CI succeeds.
2. Run **Release** manually from `main`, with the exact package version. It reuses CI, checks version/tag consistency, builds and packs, then creates a draft GitHub Release with the `.tgz`, `SHA256SUMS` and `release-manifest.json`.
3. Download the draft package and install that actual archive into independent Web and Desktop profiles. Verify native remote file preview, terminal `pwd`, and local workspaces without sending model requests. Review dependency prompts in the official installer.
4. Publish the draft as the latest stable release. Download the **public** package URL, compare its SHA-256, and run the install smoke against that URL. Check the tag commit and package version match the release manifest.

`SHA256SUMS` covers the installable archive. GitHub's automatically generated source ZIP/tar.gz is not the recommended installable `.tgz`. Runtime dependencies are still downloaded during installation.

The first public release is `v0.10.2`. Its helper remains 0.10.0 with SHA-256 `07a6170d3d248855992c320d1c9e55c1fd21c26c690e6a8f1c6de57d3659a3dc`. The verified 0.10.1 rollback commit is `abff63bafd0959820ec2d9976803f5cdbdc77580`.

中文：先通过 CI、实际安装包和 Web/Desktop 验收，再发布草稿。发布后重新下载公开地址核对哈希、验证安装。安装测试脚本只操作自己新建的临时 profile；它不是给普通用户使用的安装器。普通用户始终使用 DSH 官方插件页面或 CLI。
