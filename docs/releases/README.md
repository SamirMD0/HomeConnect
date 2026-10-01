# Release notes

Every release is a Git tag `v<version>` (for example, `v2.0.3`). CI drafts a
GitHub Release on tag push through `.github/workflows/release.yml`. Write the
notes here per version and copy them into the GitHub Release body when the
operator publishes the draft.

## Convention

- One file per release: `<version>.md` (for example, `2.0.3.md`).
- Use **Fixes**, **New**, **Breaking**, **Migration notes**, and **Operator
  checklist** sections. Omit empty sections.
- Migration notes name every migration that runs on install and any manual step
  the operator must take afterward.
- The operator checklist names smoke-test steps beyond the default upgrade
  smoke test.

## Publishing

CI drafts the release. To publish:

1. Download the drafted installer from the GitHub Release page.
2. Run the upgrade smoke test on the test PC (see
   `.claude/github-auto-update-plan/TESTING_PLAN.md`).
3. If green, edit the draft body to include the notes from
   `docs/releases/<version>.md`.
4. Uncheck "This is a pre-release" if applicable.
5. Click "Publish release".
6. The shop PC's `electron-updater` will discover the new release on its next
   six-hour check, or immediately via "Check now" in Settings.

## Never

- Never publish a release without the smoke test.
- Never delete or edit `latest.yml` on a published release. Publish a
  superseding `v<next-patch>` instead.
- Never re-use a tag. If a tag was created incorrectly, remove it before CI
  starts attaching a draft and use a new patch number.
