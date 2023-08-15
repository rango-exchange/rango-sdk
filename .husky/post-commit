#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

if [ -z "${GIT_COMMITTER_DATE:-}" ]; then
    DATE="$(date -u +%Y-%m-%dT%H:%M:%S%z)";
    export GIT_AUTHOR_DATE="$DATE";
    export GIT_COMMITTER_DATE="$DATE"
    git commit --amend --date "$DATE" --no-edit
fi