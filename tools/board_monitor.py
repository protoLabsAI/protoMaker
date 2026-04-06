#!/usr/bin/env python3
"""board_monitor — protoLabs Studio board health tool.

Actions:
    stale_prs   Detect stale open PRs in a GitHub repository.
                A PR is stale if updatedAt is older than STALE_THRESHOLD_SECONDS.

Usage:
    python3 tools/board_monitor.py stale_prs --repo <owner/repo>

Output:
    JSON array written to stdout. Errors go to stderr with non-zero exit.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone

STALE_THRESHOLD_SECONDS = 7200  # 2 hours


def fetch_open_prs(repo: str) -> list:
    """Fetch open PRs from GitHub using the gh CLI."""
    result = subprocess.run(
        [
            "gh", "pr", "list",
            "--repo", repo,
            "--state", "open",
            "--json", "number,title,headRefName,updatedAt,isDraft,statusCheckRollup,reviews",
            "--limit", "50",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"gh pr list exited with {result.returncode}")
    return json.loads(result.stdout)


def compute_staleness(pr: dict, now: datetime) -> dict | None:
    """Return stale PR metadata dict, or None if the PR is not stale."""
    updated_at_str = pr.get("updatedAt", "")
    if not updated_at_str:
        return None

    updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
    age_seconds = (now - updated_at).total_seconds()

    if age_seconds < STALE_THRESHOLD_SECONDS:
        return None

    hours_open = round(age_seconds / 3600, 1)

    # Classify CI state from statusCheckRollup
    rollup = pr.get("statusCheckRollup") or []
    if rollup:
        states = [
            c.get("state", "").upper()
            for c in rollup
            if isinstance(c, dict)
        ]
        if any(s in ("FAILURE", "ERROR") for s in states):
            ci_state = "failing"
        elif all(s == "SUCCESS" for s in states if s):
            ci_state = "passing"
        else:
            ci_state = "pending"
    else:
        ci_state = None

    has_reviews = bool(pr.get("reviews"))

    # Determine recommended action
    if pr.get("isDraft"):
        recommended = "Mark ready for review or close if abandoned."
    elif ci_state == "failing":
        recommended = "Fix failing CI checks and push a new commit."
    elif not has_reviews:
        recommended = "Request a reviewer or merge if ready."
    else:
        recommended = "Address review comments or merge if approved."

    return {
        "number": pr["number"],
        "title": pr["title"],
        "headRefName": pr.get("headRefName", ""),
        "updatedAt": updated_at_str,
        "hoursOpen": hours_open,
        "isDraft": pr.get("isDraft", False),
        "ciState": ci_state,
        "hasReviews": has_reviews,
        "recommendedAction": recommended,
    }


def cmd_stale_prs(repo: str) -> None:
    """Print JSON array of stale PRs to stdout."""
    try:
        prs = fetch_open_prs(repo)
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    now = datetime.now(timezone.utc)
    stale = [result for pr in prs if (result := compute_staleness(pr, now)) is not None]
    print(json.dumps(stale, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="board_monitor — protoLabs Studio board health tool"
    )
    subparsers = parser.add_subparsers(dest="action", required=True)

    stale_parser = subparsers.add_parser("stale_prs", help="Detect stale open PRs")
    stale_parser.add_argument(
        "--repo", required=True, help="GitHub repo slug (owner/repo)"
    )

    args = parser.parse_args()

    if args.action == "stale_prs":
        cmd_stale_prs(args.repo)


if __name__ == "__main__":
    main()
