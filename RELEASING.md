# Releasing

This document is the maintainer checklist for shipping a new version of **Rollover Daily Todos with Context**.

Obsidian installs community plugins from **GitHub Releases** on `mjparker/obsidian-rollover-todos-with-context`. Each release must publish **`main.js`** and **`manifest.json`** as separate release assets. Do not commit `main.js` to the repository.

## Before you release

- Merge the changes you want in the release to `master`.
- Run the test suite locally:

```bash
pnpm install
pnpm test
pnpm build
```

## Version metadata

Update these files in the same commit:

1. **`manifest.json`**
   - Set `"version"` to the new release number (for example `1.0.1`).
   - Update `"minAppVersion"` only when the plugin requires a newer Obsidian build.
2. **`versions.json`**
   - Add `"<new-version>": "<minAppVersion>"`.
   - Keep older entries so users on older Obsidian versions can install a compatible build.
3. **`package.json`** (optional but recommended)
   - Keep `"version"` aligned with `manifest.json`.

Use semantic versioning. The git tag must match `manifest.json` `version` exactly. Do not prefix tags with `v`.

## Automated release (recommended)

Pushing a version tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml). The workflow builds the plugin, verifies that the tag matches `manifest.json`, and attaches `main.js` and `manifest.json` to the GitHub release.

```bash
git add manifest.json versions.json package.json
git commit -m "chore: release 1.0.1"
git push origin master

git tag 1.0.1
git push origin 1.0.1
```

After the workflow finishes, confirm the release assets:

```bash
gh release view 1.0.1 \
  --repo mjparker/obsidian-rollover-todos-with-context \
  --json assets
```

You should see `main.js` and `manifest.json` listed as individual assets.

## Manual release (fallback)

Use this if the workflow fails or you need to repair an existing release.

```bash
pnpm install
pnpm build

gh release create 1.0.1 \
  --repo mjparker/obsidian-rollover-todos-with-context \
  --title 1.0.1 \
  --notes "Short summary of what changed." \
  main.js manifest.json
```

To replace assets on an existing release, use `gh release upload` with `--clobber`.

## Community plugin directory

If the plugin is already listed in [obsidian-releases](https://github.com/obsidianmd/obsidian-releases), publishing a new GitHub release is usually enough for users to update from **Settings → Community plugins**.

You only need a new pull request to `obsidian-releases` when:

- submitting the plugin for the first time, or
- changing listing metadata such as the repository URL or plugin id.

## Local development after a release

If your vault uses a symlink into this repository, run `pnpm build` after pulling release changes and reload the plugin in Obsidian. Mobile and other devices should install or update from **Community plugins**, not from a desktop symlink.
