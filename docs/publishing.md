# Publishing to npm

The `Library and PDF checks` workflow tests every pull request and push. Its
publish job runs only for pushes to `main` where the root package version
has changed compared with the commit before the push. Documentation changes and
other commits with an unchanged version do not publish anything. A push containing
multiple commits is compared as a whole.

To release, update the version in `package.json` and `package-lock.json` together
(for example, `npm version patch --no-git-tag-version`) and merge that change into
`main`. Versions must be SemVer without build metadata. Stable versions use the
`latest` npm tag; prereleases use `next`. A failed registry lookup or a version
already present on npm stops publication. Rerunning a successful release therefore
fails the duplicate-version check rather than overwriting the package.

Publishing requires the CanvasKit source rebuild, both unit-test platforms, lint,
TypeScript, PDF structure/visual checks, the installed-package smoke test and
veraPDF PDF/UA-1 validation to succeed for the same commit. The smoke test saves
the exact archive it installed and exercised to `.cache/npm-package/package.tgz`.
CI uploads this archive and the publish job downloads it without rebuilding or
repacking. No publishing credentials are made available to the test jobs.

## One-time setup

1. Ensure you own the npm name `html2pdf-accessible`. If the package has not yet
   been published, make the initial publication from a tested archive using an
   authenticated maintainer account before configuring its npm package settings.
2. In GitHub repository settings, create the deployment environment `npm` and
   allow deployments only from `main`. Do not require manual deployment approval
   if every version change on `main` should publish automatically.
3. In the npm package's **Settings → Trusted publishing**, add GitHub Actions:

   | Field                | Value                                |
   | -------------------- | ------------------------------------ |
   | Organization or user | `MathiasCiarlo`                      |
   | Repository           | `html2pdf-accessible`                |
   | Workflow filename    | `pdf-tests.yml`                      |
   | Environment          | `npm`                                |
   | Allowed action       | Direct publishing with `npm publish` |

4. Keep `package.json`'s repository URL consistent with the GitHub repository.
   Protect `main` with required CI checks and prohibit force pushes.

The publish job uses GitHub-hosted Ubuntu, Node 24 and npm 11.21.0. Its only
additional permission is `id-token: write`, used for npm's short-lived OIDC
credentials. An `NPM_TOKEN` secret is unnecessary. Actions are pinned to commit
hashes. Keep those hashes and the npm CLI version updated deliberately.

npm generates provenance automatically for OIDC publication from a public
repository to a public package. This records the publishing workflow and source
commit; the separate CanvasKit manifest records the native build inputs. Neither
is a claim of full PDF/UA conformance. PAC and actual screen-reader table
navigation remain manual release checks described in `tests/pdf/README.md`.

See the [official npm Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for the account-side setup and supported runners.
