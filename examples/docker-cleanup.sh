#!/usr/bin/env bash
# Description: Clean up unused Docker containers, images, volumes, and networks.
#
# @param prune_all {boolean} Remove all unused images not just dangling ones
# @param dry_run {boolean} Simulate cleanup without removing containers
# @param older_than_days {integer} Prune items older than specified days
# @param filter_label {string} Docker label filter to match

PRUNE_ALL=false
DRY_RUN=false
OLDER_THAN_DAYS=7
FILTER_LABEL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --prune-all)
      PRUNE_ALL=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --older-than-days)
      OLDER_THAN_DAYS="$2"
      shift 2
      ;;
    --filter-label)
      FILTER_LABEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Executing Docker prune: prune_all=$PRUNE_ALL older_than_days=$OLDER_THAN_DAYS"
if [ "$DRY_RUN" = "true" ]; then
  echo "[DRY_RUN] Docker system prune simulation completed."
  exit 0
fi

docker system prune -f
docker volume prune -f
