#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: source ./start-worktree.sh <branch> [target-dir] [base-branch]

Creates a new git worktree for the given branch. If the branch does not exist,
it is created from the base branch (defaults to the current branch or main).

Note: This script does not change your shell directory. After it finishes,
run "cd <target_dir>" yourself or source start-worktree.sh in your shell.

Examples:
  ./start-worktree.sh feature/new-map
  ./start-worktree.sh feature/new-map ./.worktrees/new-map main
  source ./start-worktree.sh feature/new-map
EOF
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || -z ${1:-} ]]; then
  usage
  exit 1
fi

branch_name="$1"
target_dir="${2:-}"

# Get the script directory, handling both direct execution and sourcing in bash/zsh
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  script_path="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  script_path="${(%):-%x}"
else
  script_path="$0"
fi

script_dir="$(cd "$(dirname "$script_path")" && pwd)"

# repo_root is the root of the current worktree (or main repo) - used for context
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"

# main_repo_root is the root of the main repository - used for paths
git_common_dir="$(git -C "$script_dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$git_common_dir" == ".git" || ! "$git_common_dir" =~ ^/ ]]; then
  main_repo_root="$repo_root"
else
  main_repo_root="$(dirname "$git_common_dir")"
fi

if [[ -z "$target_dir" ]]; then
  target_dir="${main_repo_root}/.worktrees/${branch_name}"
fi

current_branch="$(git -C "$repo_root" symbolic-ref --quiet --short HEAD || true)"
base_branch="${3:-${current_branch:-main}}"

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/${branch_name}"; then
  git -C "$repo_root" worktree add "$target_dir" "$branch_name"
else
  git -C "$repo_root" worktree add -b "$branch_name" "$target_dir" "$base_branch"
fi

source_env="${main_repo_root}/deploy/.env"
dest_env="${target_dir}/deploy/.env"

if [[ -f "$source_env" && ! -f "$dest_env" ]]; then
  mkdir -p "$(dirname "$dest_env")"
  cp "$source_env" "$dest_env"
  echo "Copied .env to ${dest_env}"
elif [[ -f "$dest_env" ]]; then
  echo ".env already exists at ${dest_env}"
else
  echo "No .env found to copy from ${source_env}"
fi

mkdir -p "${target_dir}/data/backups"

if command -v bun >/dev/null 2>&1; then
  echo "Installing dependencies in ${target_dir}"
  bun install --cwd "$target_dir"
else
  echo "Bun not found; skipping dependency install."
fi

echo "Worktree ready at ${target_dir}"
echo "Run 'cd ${target_dir}' to enter the worktree."
