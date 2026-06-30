# Runbook: Shrink the 2 GB Git History

> **Who runs this:** You (the repo owner), manually, in the Replit Shell.
> **The agent did NOT and cannot run any of these steps.** History rewriting is
> destructive, requires a force-push, and git write commands are blocked for the
> agent. Everything below was verified read-only; you execute it yourself.

---

## Why the repo is 2 GB

Large binaries (mostly generated MP3s) were committed in the past and later only
*untracked* (commit `dd761a46`). Untracking stops **new** commits from including
them, but every old blob still lives in history — so `.git` stays ~2 GB and every
clone/fork still downloads all of it. The only way to reclaim the space is to
**rewrite history** to drop those blobs from every past commit.

## What will be removed (verified against current history)

| Path (all history) | Size in history | `.gitignore` line |
|--------------------|-----------------|-------------------|
| `public/audio/`    | **1912.6 MB**   | `public/audio/` (5) |
| `node_modules/`    | 115.1 MB        | `node_modules/` (17) |
| `attached_assets/*.mp4` / `*.mov` / `*.webm` | 26.1 MB (one `.mp4`) | `attached_assets/*.mp4` etc. (12–14) |
| `exports/`         | 3.7 MB          | `exports/` (11) |
| `books/audio-cache/` | 0 MB (never committed) | `books/audio-cache/` (8) |

**Baseline `.git` size: ~2.0 GB.** `public/audio/` is essentially the entire
bloat; everything else is rounding error but worth purging while you're in there.

### Why NOT purge all of `attached_assets/`
Only the **media files** (`*.mp4`/`*.mov`/`*.webm`) are gitignored there. Other
files like `attached_assets/Instagram_*.html` are tracked legitimately and must
stay. The commands below target only the ignored media globs, not the folder.

### Safety pre-check: everything being purged is already gitignored
This was verified with `git check-ignore` — every target path above is excluded
by `.gitignore`, so once history is rewritten the blobs **cannot re-enter** on a
future commit. You do not need to change `.gitignore`.

---

## ⚠️ Before you start — read this

- **This rewrites every commit hash.** All SHAs change.
- **Everyone else must delete their clone and re-clone afterward.** Old clones
  will fight the rewritten history on their next pull.
- **Open PRs / unmerged branches break.** They must be rebased onto, or
  re-created from, the rewritten history.
- **It requires a `git push --force`.** There is no undo on the remote once you
  force-push (your local mirror backup from Step 1 is your safety net).
- Do this when no one else is mid-push, and ideally announce a short freeze.

---

## Step 1 — Make a full backup (mirror clone)

Never rewrite without a backup. A mirror clone captures all refs and history.

```bash
cd ~
git clone --mirror /home/runner/workspace /home/runner/workspace-backup.git
du -sh /home/runner/workspace-backup.git   # confirm the backup exists (~2 GB)
```

If anything goes wrong later, this mirror is a complete, restorable copy.

## Step 2 — Record the baseline size

```bash
cd /home/runner/workspace
du -sh .git
```

Expect roughly `2.0G`. You'll compare against this at the end.

## Step 3 — Purge the large paths from ALL history

### Preferred: `git filter-repo` (already installed in this Repl)

`git-filter-repo` is available at `~/.pythonlibs/bin/git-filter-repo` (and on
`PATH` as `git filter-repo`). Verify, then run the purge:

```bash
cd /home/runner/workspace
git filter-repo --version    # confirm it runs

git filter-repo --force \
  --invert-paths \
  --path public/audio/ \
  --path node_modules/ \
  --path exports/ \
  --path-glob 'attached_assets/*.mp4' \
  --path-glob 'attached_assets/*.mov' \
  --path-glob 'attached_assets/*.webm'
```

- `--invert-paths` = remove the listed paths (keep everything else).
- `--path public/audio/` matches that directory across **all** commits.
- `--path-glob` handles the attached_assets media so the rest of that folder is
  untouched.
- `--force` is required because this is not a fresh clone.

> Note: `git filter-repo` intentionally **removes the `origin` remote** after
> rewriting (to stop an accidental push of half-done work). You re-add it in
> Step 6.

### Fallback: `git filter-branch` (only if filter-repo is unavailable)

Slower and officially discouraged, but works everywhere:

```bash
cd /home/runner/workspace
git filter-branch --force --index-filter '
  git rm -r --cached --ignore-unmatch \
    public/audio node_modules exports \
    attached_assets/*.mp4 attached_assets/*.mov attached_assets/*.webm
' --prune-empty --tag-name-filter cat -- --all

# filter-branch leaves backup refs that pin the old blobs — drop them:
git for-each-ref --format='%(refname)' refs/original/ | xargs -n 1 git update-ref -d
```

## Step 4 — Expire reflogs and garbage-collect

The old blobs are now unreferenced but still on disk until gc prunes them.

```bash
cd /home/runner/workspace
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Step 5 — Verify the new `.git` size

```bash
du -sh .git
```

Expect it to drop from ~2.0 GB to well under ~100 MB. If it's still large,
re-check Step 3 ran cleanly (and for the filter-branch path, that `refs/original/`
was deleted before gc).

Optional — confirm the purged paths are gone from history:

```bash
git rev-list --objects --all | grep -E 'public/audio/|node_modules/|exports/|attached_assets/.*\.(mp4|mov|webm)$' || echo "clean: none of the purged paths remain in history"
```

## Step 6 — Force-push the rewritten history

`git filter-repo` removed `origin`, so re-add it first (use your real remote URL —
check the backup mirror's config if unsure):

```bash
cd /home/runner/workspace
git remote -v                       # if origin is missing, re-add it:
# git remote add origin <YOUR_REMOTE_URL>

git push --force --all origin
git push --force --tags origin
```

> If `--all` is rejected because of branch protection, force-push `main` alone:
> `git push --force origin main`.

## Step 7 — Tell collaborators to re-clone

Post this to anyone with a clone:

> History was rewritten to shrink the repo. **Delete your local clone and
> re-clone** — do not `git pull`. Any open branches/PRs must be rebased onto or
> re-created from the new history.

## Step 8 — Clean up the backup (after you're confident)

Keep the mirror for a while. Once everything is confirmed healthy:

```bash
rm -rf /home/runner/workspace-backup.git
```

---

## Rollback (if something went wrong before/after pushing)

The mirror from Step 1 is a full backup. To restore locally:

```bash
cd ~
rm -rf /home/runner/workspace/.git
git clone --mirror /home/runner/workspace-backup.git restored.git
# then re-point your working tree at restored.git, or re-clone from the backup.
```

If you already force-pushed and need the old remote state back, push the backup
mirror's refs back to origin (force). This is exactly why Step 1 is mandatory.

---

## Quick reference — the whole flow

```bash
# 1. backup
git clone --mirror /home/runner/workspace ~/workspace-backup.git
# 2. baseline
du -sh .git
# 3. purge
git filter-repo --force --invert-paths \
  --path public/audio/ --path node_modules/ --path exports/ \
  --path-glob 'attached_assets/*.mp4' --path-glob 'attached_assets/*.mov' --path-glob 'attached_assets/*.webm'
# 4. gc
git reflog expire --expire=now --all && git gc --prune=now --aggressive
# 5. verify
du -sh .git
# 6. push (re-add origin first if filter-repo dropped it)
git push --force --all origin && git push --force --tags origin
```
