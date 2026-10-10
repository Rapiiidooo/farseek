# Deployment

```bash
npm ci --ignore-scripts
npm run check
node scripts/save-check.mjs
python3 scripts/release-check.py
node scripts/build-release.mjs HEAD outputs/release
python3 scripts/deploy-release.py outputs/release "$(git rev-parse HEAD)" --verify-only
```

`npm run check` requires the recipe repository cloned beside this repository. The packaging script also accepts another recipe location through `FARSEEK_RECIPE_DIR`. Packaging reads the requested Git commit and ignores uncommitted changes. The archive contains only its `game/` tree. `release.json` records the commit, release ID, archive checksum and every runtime file checksum. No compilation or backend is required. Serve text assets with gzip or Brotli and WebP files as `image/webp`; the character includes geometry data and compressed textures. `npm start` negotiates gzip locally. Release packaging includes runtime assets, while the production web server owns transfer compression.

The existing private `build-release.sh` and `deploy-release.sh` remain the manual deployment procedure. Supply the current `farseek/` repository path to the builder, upload the archive through the existing management access, then run the installer with its release ID and archive path. The installer creates an immutable release, switches `current` atomically, checks local HTTP and restores the previous release if that check fails. An existing release ID is refused, including a repeated deployment of the same commit on the same UTC day. The private infrastructure handoff at `kusanagi/infra/services/far-door/README.md`, outside this repository, owns access details and rollback commands.

## Automatic deployment from main

[The workflow](../.github/workflows/release.yml) validates pull requests and pushes to `main` on a GitHub hosted Ubuntu runner. It runs module containment and parsing checks, save compatibility and release integrity tests, then packages that exact commit. The recipe and actions are pinned to immutable SHAs. These checks do not replace the browser campaign, touch and GPU gates in the game verification report.

Publication stays disabled until the repository variable `FARSEEK_AUTO_DEPLOY` is `true`. Only a `push` to this repository's `main` can request deployment. Pull requests and manual workflow runs only validate and package. The public workflow sends the commit and run ID to a private operations repository using [workflow dispatch](https://cli.github.com/manual/gh_workflow_run). Its successful dispatch means the request was accepted; the private workflow records the actual deployment result.

The [private workflow template](private-deploy-workflow.yml) verifies the public repository, workflow, `push` event, `main` branch, commit and successful validation job through GitHub's API. It downloads the named artifact from that exact run, verifies that the commit is still current on `main`, and serializes production switches. Its runner never checks out or executes game code. A runner attached to the public repository could be targeted by another pull request workflow, so it belongs exclusively to the private operations repository. See [GitHub's runner guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

Activation requires these one-time operational changes:

1. Copy the private template to `.github/workflows/farseek-deploy.yml` on the private operations repository's `main`. Configure `production` environments restricted to `main` in both repositories and protect workflow changes. Leave required reviewers off if every passing push should deploy automatically. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments) control this policy.
2. Register a dedicated Linux runner with label `farseek-deploy` exclusively in that private repository, inside the existing management network. Install Python 3.10 or newer, OpenSSH and GitHub CLI; isolate it from other services and untrusted contributors. Install the reviewed [wrapper](../scripts/deploy-release.py) as root-owned `/usr/local/bin/farseek-deploy`, mode `0755`, and copy the existing private installer onto the runner, also protected against writes by its service account.
3. Configure the runner service with `FARSEEK_SSH_TARGET` (an existing SSH alias), `FARSEEK_DEPLOY_SCRIPT` (the absolute path to that private installer) and `FARSEEK_PUBLIC_URL` (the HTTPS site root). The alias supplies the dedicated deployment identity, pinned host keys and any management hop. Credentials remain on the runner. This requires no new public firewall opening.
4. In the public `production` environment, set variable `FARSEEK_DEPLOY_REPOSITORY` to the private repository's `owner/name` and secret `FARSEEK_DEPLOY_TOKEN` to a fine-grained token restricted to that repository with Actions write access. In the private `production` environment, set `FARSEEK_SOURCE_TOKEN` to a separate token restricted to this public repository with Actions read and Contents read access, for run verification and artifact download. Neither token grants SSH access.
5. Exercise the installed wrapper on an approved release, then set the public repository variable `FARSEEK_AUTO_DEPLOY` to `true`. A later push to `main` activates the pipeline. No private workflow, runner, environment, credentials, GitHub variable or production release is installed by adding these files.

The installed wrapper's interface is:

```bash
sudo install -o root -g root -m 0755 scripts/deploy-release.py /usr/local/bin/farseek-deploy
/usr/local/bin/farseek-deploy /path/to/downloaded/artifact FULL_COMMIT_SHA --verify-only
/usr/local/bin/farseek-deploy /path/to/downloaded/artifact FULL_COMMIT_SHA
```

The `--verify-only` invocation performs local validation. Without that flag, the wrapper uploads the validated archive, checks its checksum again on the server, and feeds the existing private installer to `bash -s -- RELEASE_ID ARCHIVE_PATH`. The SSH alias must select an account with the installer's required root privileges on the game VM. Archive paths, links, unexpected files and checksum mismatches are rejected before network access. The wrapper then compares the public page, main module and explorer asset with the artifact. A public mismatch fails the job and requires the private rollback procedure; the private installer's automatic rollback covers its local HTTP check.

Set `FARSEEK_AUTO_DEPLOY` to `false` to stop future automatic deployments. To roll back a published release, use the private handoff to select the previous immutable release and verify its public file hashes. Workflow preparation alone does not publish the local expansion.
