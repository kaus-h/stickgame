# GMR-109: patch inbox preparation and checkout isolation

Scope: fix preparation, diagnostics and isolation in the explicitly requested sensitive inbox tooling. No game/canon changes. Task data cannot authorize writes to the owner checkout or forbidden agent files.

Acceptance: format touched surviving files with the installed local Prettier, fail explicitly on preparation errors, regenerate the level validator before format/check when its schema changes, and produce a nonempty error excerpt with a last-30-lines fallback. Git commands must ignore inherited repository overrides, verify their effective linked worktree/branch before apply and commit, and stage only validated task/generated files; never `.claude/`.

Evidence: helper tests plus isolated temporary Git repositories that reproduce inherited environment/index scope, wrong-root/branch rejection, formatting/schema behavior and report fallbacks; required repository checks and bundle budget. No live inbox task or owner checkout repair is run.

The preparation helper invokes the installed Prettier entry with `process.execPath`, preserving each filename as an argument. A real CLI test formats a deliberately unformatted TypeScript file whose name contains spaces; deleted paths remain tracked for staging but are omitted from formatting. Compiler and formatter failures stop preparation and retain their output. Schema compilation precedes formatting and adds the generated validator to the touched-path set.

Git regression fixtures create two independent temporary repositories and linked worktrees under `D:\tmp`. Injected `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR` and command-line configuration cannot redirect a real linked-worktree commit: the fixture owner HEAD and index stay byte-identical. The root/branch guard also refuses the owner checkout, nested roots, protected branches, incorrect branches, and a foreign repository's same-named branch. Temporary cleanup checks the resolved target remains inside its fixture directory.

The integration stages an explicit list with literal pathspecs, then checks the entire cached index against that list and forbidden-path rules. It repeats linked-worktree verification before commit and push. User Git configuration and SSH authentication remain available; repository selectors and injected Git configuration are removed from child-process environments.

Filesystem guards reject symlinks/junctions in task input and staging trees, destination components, newly applied patch paths, and formatter targets. This prevents an otherwise allowed filename from directing a write or formatter outside the linked worktree. A temporary directory-link fixture checks the refusal and preserves the target contents.

No game assets, simulation state, replay goldens, or bundle thresholds change. Browser/native testing and a live inbox push/PR transaction are outside this tool-only proof; the real owner checkout is not repaired or modified.

## Final local validation (2026-10-10)

- `npm run check`: passed; 60 unit files, 477 passed tests and 3 existing expected failures. Level validation: 15 levels, 0 errors, 4 existing collision-lab warnings. Typecheck, lint, layer rules, formatting and production build passed.
- Inbox regression coverage: 27 tests across core, preparation and Git/filesystem fixtures. Includes a real Windows Node/Prettier invocation and a real temporary linked-worktree commit with owner HEAD/index invariance.
- `npm run bundle:report`: initial JavaScript gzip 252.2 / 270 KB, total distribution 1027.6 / 1090 KB; both green, thresholds unchanged.
- Node syntax checks for the inbox entry and helper modules, plus `git diff --check`: passed.
- Luna review caught the quoted-path and filesystem-link gaps; both have regression coverage. All work remains on the GMR-109 branch for Opus review; no merge.
