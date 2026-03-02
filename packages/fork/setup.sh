#!/usr/bin/env bash
# One-time setup for a new machine working on this fork.
# Run from the repo root after cloning.
set -e

# Upstream remote
if ! git remote get-url upstream &>/dev/null; then
    git remote add upstream https://github.com/can1357/oh-my-pi.git
fi
git fetch upstream

# git-flow-next (requires: brew install gittower/tap/git-flow-next)
git flow init --preset=github --main=main --no-create-branches

# Remove develop added by preset
git config --local --unset gitflow.branch.develop.type      || true
git config --local --unset gitflow.branch.develop.parent    || true
git config --local --unset gitflow.branch.develop.autoupdate || true

# Topic types: feature, fix, hotfix — all squash onto main, rebase from main
git flow config add topic fix     main --prefix=fix/     --upstream-strategy=squash --downstream-strategy=rebase
git flow config add topic hotfix  main --prefix=hotfix/  --upstream-strategy=squash --downstream-strategy=rebase
git flow config edit topic feature      --upstream-strategy=squash --downstream-strategy=rebase

echo "Setup complete. Run 'git flow config list' to verify."
