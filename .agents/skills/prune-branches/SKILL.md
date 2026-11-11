---
name: prune-branches
description: Prune local branches and detached worktrees that are no longer active, using the GitHub PR lifecycle to decide what is safe to delete. Use when the user wants to clean up old branches, remove non-main branches, delete merged feature branches, clear stale remote-tracking refs, or remove abandoned worktrees. Preserves branches/worktrees that still look in use (open PR, missing PR, or unpushed commits) and warns when in-use items have lived too long.
---

# Prune Branches & Worktrees

Clean up local branches (everything except the main branch) and detached worktrees. Decide per branch whether it is still "in use" via the **GitHub PR lifecycle**, not git state alone: a branch with an open or unmerged PR is still being worked on.

Never delete an "in-use" branch/worktree and never touch the main branch.

## Decision Model

Resolve each local branch in order (first match wins). Remote = `origin` (or whichever your current branch tracks).

| State | Condition | Handling |
|---|---|---|
| Unpushed (high-risk) | No remote counterpart (`git ls-remote --heads origin`) | 🔴 Never auto-delete. List high-risk; manual confirmation. |
| Orphan | No associated PR **and** remote branch already deleted | 🟡 Warn & keep; manual confirmation. |
| In use (no PR) | No associated PR, but remote branch still exists | 🟢 Keep. |
| In use (PR not merged) | Associated PR open, or closed without merge | 🟢 Keep. |
| In use but stale | Any keep-state above, PR/branch older than **14 days** | 🟠 Keep but warn. |
| Safe to delete | Associated PR **merged** **and** remote branch deleted | ✅ Delete branch (and worktree if any). |

A worktree follows the rule of the branch it checks out: remove it only when that branch is "safe to delete" and the worktree directory has no uncommitted changes.

Definitions:
- **Associated PR** — a PR whose `headRefName` matches this branch (also compare the branch's upstream remote name). Use `--state all` so merged PRs appear.
- **Main branch** — remote default (`git symbolic-ref refs/remotes/origin/HEAD`), e.g. `main`/`master`. Always kept.

## Prerequisites

```bash
gh --version
gh auth status
```
`gh` is required. If unavailable, fall back to the conservative git-only heuristic at the bottom and tell the user PR-aware safety is off.

```bash
git remote -v                                   # identify remote
git status                                      # confirm main checkout state
```

## Workflow

Run in order. Always present the full inventory and get explicit confirmation before any destructive command.

1. **Inventory worktrees** — `git worktree list`. Identify the main checkout (repo root) and detached worktrees.
2. **Inventory branches** — `git branch -vv`. Exclude the main branch; note branches currently checked out (must switch first).
3. **Query remote & PRs**
   ```bash
   git ls-remote --heads origin
   gh pr list --repo <owner>/<repo> --state all --limit 500 \
     --json number,state,mergedAt,headRefName,createdAt \
     --jq '.[] | "\(.number)\t\(.state)\t\(.mergedAt)\t\(.headRefName)\t\(.createdAt)"'
   ```
4. **Classify & present plan** — table per the Decision Model; flag stale/orphan/unpushed with `[WARNING]`. Get confirmation, especially before `-D` or worktree removal.
5. **Execute deletions** (per "safe to delete" branch, in order)
   ```bash
   git -C <worktree-path> checkout <main-branch>   # if branch checked out there
   git worktree remove <worktree-path>             # safe; --force only if user authorizes discarding changes
   git branch -d <branch>                          # -D only with explicit authorization
   ```
   For the main checkout's current branch if it's a candidate: switch main checkout to `<main-branch>` first, then delete.
6. **Prune stale remote-tracking refs**
   ```bash
   git remote prune origin --dry-run    # confirm list first
   git remote prune origin              # or: git branch -dr origin/<branch>
   ```
7. **Verify** — `git worktree list`, `git branch -vv`, `git remote prune origin --dry-run` (should report nothing). Report kept/warned/deleted counts.

## Safety Rules

- Never touch the main branch or main checkout.
- Never auto-delete unpushed/orphan/non-merged-PR branches; require manual confirmation.
- Default to safe `-d` and safe `git worktree remove`; use `-D`/`--force` only with explicit authorization.
- Dry-run `git remote prune` before pruning.
- Present plan + get confirmation before any destructive command.

## Git-only fallback (no `gh`)

Conservative, and say so:
- Keep anything not merged into main (`git branch --no-merged <main>`) and anything with a remote counterpart.
- Treat "no remote counterpart" as unpushed → keep + warn.
- Delete only branches **merged into main AND with no remote counterpart** (strongest signal without PR data).
- Stale warning uses last commit date (`git log -1 --format=%ci`) vs 14 days.
