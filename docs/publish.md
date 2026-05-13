
# **Publish Workflow**

## Overview

The `Publish` workflow publishes the library packages to npm. It runs automatically when a commit is pushed to the `next` branch, or can be triggered manually via `workflow_dispatch`.

---

## **Trigger Conditions**

| Trigger | Branch | Publish Flag |
|---|---|---|
| Push | `next` | `--next` |
| Manual (`workflow_dispatch`) | any | detected from branch |

---

## **Workflow Steps**

1. **Checkout** — Checks out the branch at full depth (`fetch-depth: 0`) so git tags are available for change detection.

2. **Prepare** — Runs the reusable `.github/actions/prepare` action:
   - Sets up Node.js 24 with the yarn cache.
   - Configures the `github-actions[bot]` git identity.
   - Runs `yarn install --frozen-lockfile`.

3. **Detect publish flag** — Runs the reusable `.github/actions/detect-publish-flag` action. Outputs one of:
   - `--prod` → branch is `main`
   - `--next` → branch is `next`
   - `--experimental` → any other branch

4. **Publish packages** — Runs `yarn run publish --since-start <flag>` with the detected flag.

---

## **Publish Flags**

### `--next` (Staging)

Published automatically on every push to `next`. Packages are tagged `next` on npm.

To install a next release for example:

```sh
yarn add rango-sdk@next
```

### `--prod` (Production)

Published when the workflow runs on `main`. Packages are tagged `latest` on npm.

It is recommended to sync your `next` branch with `main` by merging `main` into it so it does not fall behind `main`.

### `--experimental`

Triggered manually from a feature branch (base should be `main`). Packages are tagged `experimental` on npm.

To trigger an experimental publish, run the **`Publish`** workflow manually from your feature branch.

---

## **Required Secrets / Tokens**

| Secret      | Purpose |
|-------------|---|
| `NPM_TOKEN` | Authenticates `yarn publish` against the npm registry |
| `PAT`       | Allows the workflow to push version bumps and tags back to the repo |

---

## **Visual Diagram**

```
  Push to `next`                      workflow_dispatch
        │                                    │
        └──────────────┬─────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    Checkout     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     Prepare     │  (Node 24, yarn cache, git identity)
              └────────┬────────┘
                       │
                       ▼
              ┌──────────────────────┐
              │  Detect Publish Flag │  --next | --prod | --experimental
              └────────┬─────────────┘
                       │
                       ▼
              ┌────────────────────────────┐
              │  yarn run publish <flag>   │
              └────────────────────────────┘
```
