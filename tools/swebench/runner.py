#!/usr/bin/env python3
"""
SWE-bench Evaluation Runner for protoLabs Studio.

Runs Claude against SWE-bench instances and collects predictions.
Supports direct mode (Claude API) for benchmarking.

Usage:
    python runner.py                          # SWE-bench Lite, sonnet, 1 worker
    python runner.py --dataset verified       # SWE-bench Verified
    python runner.py --model opus --workers 4 # Opus, 4 parallel
    python runner.py --instance-ids sympy__sympy-20590  # Single instance
    python runner.py --resume                 # Resume from last checkpoint
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    from anthropic import Anthropic
    from datasets import load_dataset
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
    from rich.table import Table
except ImportError:
    print("Missing dependencies. Run: pip install -r requirements.txt")
    sys.exit(1)

console = Console()

# ─── Configuration ─────────────────────────────────────────────────────────

DATASET_MAP = {
    "lite": "princeton-nlp/SWE-bench_Lite",
    "verified": "princeton-nlp/SWE-bench_Verified",
    "full": "princeton-nlp/SWE-bench",
}

MODEL_MAP = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "haiku": "claude-haiku-4-5-20251001",
}

WORK_DIR = Path("/tmp/swebench-runs")
PREDICTIONS_DIR = Path(__file__).parent / "predictions"
CHECKPOINT_DIR = Path(__file__).parent / "checkpoints"


@dataclass
class RunConfig:
    dataset: str = "lite"
    model: str = "sonnet"
    workers: int = 1
    max_tokens: int = 16384
    thinking: bool = True
    plan_phase: bool = True
    instance_ids: list[str] = field(default_factory=list)
    resume: bool = False
    run_id: str = ""
    max_instances: int = 0  # 0 = all


@dataclass
class Prediction:
    instance_id: str
    model_name_or_path: str
    model_patch: str


@dataclass
class RunStats:
    total: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    start_time: float = 0.0


# ─── Prompt Engineering ────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert software engineer tasked with fixing a bug in a real open-source repository.

You will be given:
1. A repository checked out at a specific commit
2. An issue description explaining the bug or requested change

Your job is to produce a minimal, correct patch that resolves the issue.

Rules:
- Read the issue carefully. Understand what is broken and why.
- Explore the codebase to find the relevant files. Use grep, find, and read operations.
- Make the smallest change that fixes the issue. Do not refactor unrelated code.
- Do not add comments explaining your changes unless the logic is non-obvious.
- Do not modify test files unless the issue explicitly requires it.
- Your final output must be a unified diff (git diff format) that can be applied with `git apply`.
- If you need to create new files, include them in the diff.
- Think step by step: understand the issue, locate the code, reason about the fix, implement it, verify it.
"""

PLAN_PROMPT = """\
Before writing the fix, create a brief plan:
1. What is the root cause of the issue?
2. Which file(s) need to change?
3. What is the minimal fix?
4. What edge cases should the fix handle?

Then implement the fix.
"""

TASK_PROMPT_TEMPLATE = """\
Repository: {repo}
Commit: {base_commit}
Working directory: {work_dir}

## Issue

{problem_statement}

## Instructions

1. Explore the repository structure to understand the codebase
2. Locate the relevant code that needs to change
3. Implement a minimal fix for the issue
4. Generate a unified diff of your changes

{plan_section}

IMPORTANT: When you are done, output your final patch between <patch> and </patch> tags.
The patch must be in unified diff format (as produced by `git diff`).

Example:
<patch>
diff --git a/path/to/file.py b/path/to/file.py
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -10,7 +10,7 @@
 existing line
-old line
+new line
 existing line
</patch>
"""


# ─── Repo Management ──────────────────────────────────────────────────────

def clone_and_checkout(instance: dict, work_dir: Path) -> Path:
    """Clone the repo at the specified commit."""
    repo = instance["repo"]
    base_commit = instance["base_commit"]
    repo_dir = work_dir / repo.replace("/", "__")

    if repo_dir.exists():
        shutil.rmtree(repo_dir)

    # Shallow clone + checkout specific commit
    subprocess.run(
        ["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", str(repo_dir)],
        capture_output=True, timeout=120, check=False,
    )

    # Fetch the specific commit (shallow clone might not have it)
    subprocess.run(
        ["git", "fetch", "--depth", "1", "origin", base_commit],
        cwd=repo_dir, capture_output=True, timeout=120, check=False,
    )
    subprocess.run(
        ["git", "checkout", base_commit],
        cwd=repo_dir, capture_output=True, timeout=30, check=False,
    )

    return repo_dir


# ─── Agent Execution ──────────────────────────────────────────────────────

def run_agent(
    instance: dict,
    repo_dir: Path,
    config: RunConfig,
    client: Anthropic,
) -> Prediction | None:
    """Run Claude against a single SWE-bench instance."""
    instance_id = instance["instance_id"]
    repo = instance["repo"]
    base_commit = instance["base_commit"]
    problem_statement = instance["problem_statement"]

    plan_section = PLAN_PROMPT if config.plan_phase else ""
    prompt = TASK_PROMPT_TEMPLATE.format(
        repo=repo,
        base_commit=base_commit,
        work_dir=str(repo_dir),
        problem_statement=problem_statement,
        plan_section=plan_section,
    )

    model_id = MODEL_MAP.get(config.model, config.model)

    # Build messages with tool use for file exploration
    messages = [{"role": "user", "content": prompt}]

    try:
        # Use extended thinking for better reasoning on complex problems
        kwargs: dict[str, Any] = {
            "model": model_id,
            "max_tokens": config.max_tokens,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }

        if config.thinking:
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": 10000,
            }

        response = client.messages.create(**kwargs)

        # Extract the text content
        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        # Extract patch from <patch> tags
        patch = extract_patch(content)
        if not patch:
            console.print(f"  [yellow]No patch found in response for {instance_id}[/yellow]")
            return None

        return Prediction(
            instance_id=instance_id,
            model_name_or_path=f"protolabs-{config.model}",
            model_patch=patch,
        )

    except Exception as e:
        console.print(f"  [red]Agent failed for {instance_id}: {e}[/red]")
        return None


def extract_patch(content: str) -> str:
    """Extract unified diff from <patch>...</patch> tags."""
    if "<patch>" not in content:
        # Try to find diff content directly
        lines = content.split("\n")
        diff_lines = []
        in_diff = False
        for line in lines:
            if line.startswith("diff --git") or line.startswith("---") or line.startswith("+++"):
                in_diff = True
            if in_diff:
                diff_lines.append(line)
                if line == "" and diff_lines and not any(
                    diff_lines[-1].startswith(p) for p in ["diff", "---", "+++", "@@", "+", "-", " "]
                ):
                    break
        return "\n".join(diff_lines).strip() if diff_lines else ""

    start = content.index("<patch>") + len("<patch>")
    end = content.index("</patch>")
    return content[start:end].strip()


# ─── Checkpoint Management ─────────────────────────────────────────────────

def save_checkpoint(run_id: str, completed_ids: set[str], predictions: list[Prediction]):
    """Save progress checkpoint."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "run_id": run_id,
        "completed_ids": list(completed_ids),
        "predictions_count": len(predictions),
        "timestamp": time.time(),
    }
    (CHECKPOINT_DIR / f"{run_id}.json").write_text(json.dumps(checkpoint, indent=2))


def load_checkpoint(run_id: str) -> set[str]:
    """Load completed instance IDs from checkpoint."""
    checkpoint_file = CHECKPOINT_DIR / f"{run_id}.json"
    if not checkpoint_file.exists():
        return set()
    data = json.loads(checkpoint_file.read_text())
    return set(data.get("completed_ids", []))


# ─── Main Runner ───────────────────────────────────────────────────────────

def run_evaluation(config: RunConfig):
    """Run the full SWE-bench evaluation."""
    dataset_name = DATASET_MAP.get(config.dataset, config.dataset)
    run_id = config.run_id or f"protolabs-{config.model}-{config.dataset}-{int(time.time())}"

    console.print(f"\n[bold]protoLabs SWE-bench Runner[/bold]")
    console.print(f"  Dataset:  {dataset_name}")
    console.print(f"  Model:    {MODEL_MAP.get(config.model, config.model)}")
    console.print(f"  Plan:     {'enabled' if config.plan_phase else 'disabled'}")
    console.print(f"  Thinking: {'enabled' if config.thinking else 'disabled'}")
    console.print(f"  Run ID:   {run_id}\n")

    # Load dataset
    console.print("Loading dataset...")
    ds = load_dataset(dataset_name, split="test")
    instances = list(ds)

    # Filter by instance IDs if specified
    if config.instance_ids:
        instances = [i for i in instances if i["instance_id"] in config.instance_ids]

    if config.max_instances > 0:
        instances = instances[: config.max_instances]

    console.print(f"  {len(instances)} instance(s) to evaluate\n")

    # Resume from checkpoint
    completed_ids: set[str] = set()
    if config.resume:
        completed_ids = load_checkpoint(run_id)
        if completed_ids:
            console.print(f"  Resuming: {len(completed_ids)} already completed\n")

    # Initialize client
    client = Anthropic()

    # Prepare output
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    predictions_file = PREDICTIONS_DIR / f"{run_id}.jsonl"
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    stats = RunStats(total=len(instances), start_time=time.time())
    predictions: list[Prediction] = []

    # Load existing predictions if resuming
    if config.resume and predictions_file.exists():
        with open(predictions_file) as f:
            for line in f:
                p = json.loads(line)
                predictions.append(Prediction(**p))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Evaluating", total=len(instances))

        for instance in instances:
            instance_id = instance["instance_id"]

            if instance_id in completed_ids:
                stats.skipped += 1
                progress.advance(task)
                continue

            progress.update(task, description=f"[cyan]{instance_id}[/cyan]")

            # Clone and checkout
            try:
                repo_dir = clone_and_checkout(instance, WORK_DIR)
            except Exception as e:
                console.print(f"  [red]Clone failed for {instance_id}: {e}[/red]")
                stats.failed += 1
                progress.advance(task)
                continue

            # Run agent
            prediction = run_agent(instance, repo_dir, config, client)

            if prediction:
                predictions.append(prediction)
                stats.completed += 1

                # Append to predictions file
                with open(predictions_file, "a") as f:
                    f.write(json.dumps({
                        "instance_id": prediction.instance_id,
                        "model_name_or_path": prediction.model_name_or_path,
                        "model_patch": prediction.model_patch,
                    }) + "\n")
            else:
                stats.failed += 1

            completed_ids.add(instance_id)
            save_checkpoint(run_id, completed_ids, predictions)

            # Cleanup repo to save disk
            if repo_dir.exists():
                shutil.rmtree(repo_dir, ignore_errors=True)

            progress.advance(task)

    # Print summary
    elapsed = time.time() - stats.start_time
    console.print()

    table = Table(title="Run Summary")
    table.add_column("Metric", style="bold")
    table.add_column("Value", justify="right")
    table.add_row("Total instances", str(stats.total))
    table.add_row("Completed", f"[green]{stats.completed}[/green]")
    table.add_row("Failed", f"[red]{stats.failed}[/red]")
    table.add_row("Skipped (resumed)", str(stats.skipped))
    table.add_row("Duration", f"{elapsed:.0f}s ({elapsed/60:.1f}m)")
    table.add_row("Predictions file", str(predictions_file))
    console.print(table)

    console.print(f"\n[bold]Next step:[/bold] Run the official evaluator:")
    console.print(f"  python -m swebench.harness.run_evaluation \\")
    console.print(f"    --dataset_name {dataset_name} \\")
    console.print(f"    --predictions_path {predictions_file} \\")
    console.print(f"    --max_workers 8 \\")
    console.print(f"    --run_id {run_id}\n")

    return predictions_file


# ─── CLI ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="protoLabs SWE-bench Evaluation Runner")
    parser.add_argument("--dataset", choices=["lite", "verified", "full"], default="lite",
                        help="SWE-bench dataset variant (default: lite)")
    parser.add_argument("--model", choices=["sonnet", "opus", "haiku"], default="sonnet",
                        help="Claude model to use (default: sonnet)")
    parser.add_argument("--workers", type=int, default=1,
                        help="Parallel workers (default: 1)")
    parser.add_argument("--max-tokens", type=int, default=16384,
                        help="Max output tokens per instance (default: 16384)")
    parser.add_argument("--no-thinking", action="store_true",
                        help="Disable extended thinking")
    parser.add_argument("--no-plan", action="store_true",
                        help="Skip the planning phase")
    parser.add_argument("--instance-ids", nargs="+", default=[],
                        help="Evaluate specific instance(s) only")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from last checkpoint")
    parser.add_argument("--run-id", default="",
                        help="Custom run ID (default: auto-generated)")
    parser.add_argument("--max-instances", type=int, default=0,
                        help="Max instances to evaluate (0 = all)")

    args = parser.parse_args()

    config = RunConfig(
        dataset=args.dataset,
        model=args.model,
        workers=args.workers,
        max_tokens=args.max_tokens,
        thinking=not args.no_thinking,
        plan_phase=not args.no_plan,
        instance_ids=args.instance_ids,
        resume=args.resume,
        run_id=args.run_id,
        max_instances=args.max_instances,
    )

    run_evaluation(config)


if __name__ == "__main__":
    main()
