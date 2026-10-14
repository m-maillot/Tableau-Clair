#!/usr/bin/env bash
# Crée les issues GitHub à partir de docs/issues/*.md (frontmatter : title, milestone, labels).
# Prérequis : `gh auth login`. Usage : scripts/create-issues.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."
dry=${1:-}

for f in docs/issues/*.md; do
  title=$(sed -n 's/^title: "\(.*\)"$/\1/p' "$f")
  milestone=$(sed -n 's/^milestone: //p' "$f")
  labels=$(sed -n 's/^labels: \[\(.*\)\]$/\1/p' "$f" | tr -d ' ')
  body=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$f")
  if [ "$dry" = "--dry-run" ]; then
    echo "[$milestone] $title  ($labels)"
    continue
  fi
  gh label create "${milestone,,}" --force >/dev/null
  for l in ${labels//,/ }; do gh label create "$l" --force >/dev/null; done
  gh api "repos/{owner}/{repo}/milestones" -f title="$milestone" >/dev/null 2>&1 || true
  gh issue create --title "$title" --body "$body" --milestone "$milestone" --label "$labels"
done
