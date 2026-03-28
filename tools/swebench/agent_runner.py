#!/usr/bin/env python3
"""
SWE-bench Agentic Runner — Tool-use version.

Gives Claude tools to explore the repo, read/write files, and run commands.
This matches the agentic approach used by top SWE-bench entries.

Usage:
    python agent_runner.py --instance-ids sympy__sympy-20590  # Single test
    python agent_runner.py --max-instances 5                   # First 5
    python agent_runner.py --dataset lite                      # Full Lite run
"""

import argparse
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
    from anthropic.types import ToolUseBlock, TextBlock
    from datasets import load_dataset
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
    from rich.table import Table
except ImportError:
    print("Missing dependencies. Run: pip install -r requirements.txt")
    sys.exit(1)

console = Console()

# ─── Config ────────────────────────────────────────────────────────────────

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

MAX_TURNS = 30
MAX_BASH_OUTPUT = 8000


@dataclass
class RunConfig:
    dataset: str = "lite"
    model: str = "sonnet"
    max_tokens: int = 16384
    thinking: bool = True
    plan_phase: bool = True
    instance_ids: list[str] = field(default_factory=list)
    resume: bool = False
    run_id: str = ""
    max_instances: int = 0
    max_turns: int = MAX_TURNS


# ─── Tool Definitions ─────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "bash",
        "description": "Execute a bash command in the repository directory. Use for: grep, find, cat, head, tail, ls, python, pytest, git diff. Commands time out after 30 seconds.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute",
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file. Returns the file content with line numbers. Use for reading source code.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file from repo root",
                },
                "start_line": {
                    "type": "integer",
                    "description": "Starting line number (1-indexed, optional)",
                },
                "end_line": {
                    "type": "integer",
                    "description": "Ending line number (inclusive, optional)",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file (creates or overwrites). Use for applying fixes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file from repo root",
                },
                "content": {
                    "type": "string",
                    "description": "Full file content to write",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "submit_patch",
        "description": "Submit your final patch. Call this ONCE when you are done. Runs `git diff` and captures the patch.",
        "input_schema": {
            "type": "object",
            "properties": {
                "explanation": {
                    "type": "string",
                    "description": "Brief explanation of the fix",
                },
            },
            "required": ["explanation"],
        },
    },
]


# ─── Tool Execution ───────────────────────────────────────────────────────

def execute_tool(tool_name: str, tool_input: dict, repo_dir: Path) -> str:
    """Execute a tool and return the result string."""
    if tool_name == "bash":
        return _exec_bash(tool_input["command"], repo_dir)
    elif tool_name == "read_file":
        return _exec_read_file(tool_input, repo_dir)
    elif tool_name == "write_file":
        return _exec_write_file(tool_input, repo_dir)
    elif tool_name == "submit_patch":
        return _exec_submit_patch(tool_input, repo_dir)
    else:
        return f"Unknown tool: {tool_name}"


def _exec_bash(command: str, cwd: Path) -> str:
    """Execute a bash command with timeout."""
    # Block dangerous commands
    blocked = ["rm -rf /", "rm -rf /*", "shutdown", "reboot", "mkfs"]
    if any(b in command for b in blocked):
        return "Command blocked for safety."

    try:
        result = subprocess.run(
            ["bash", "-c", command],
            cwd=cwd, capture_output=True, text=True, timeout=30,
        )
        output = result.stdout + result.stderr
        if len(output) > MAX_BASH_OUTPUT:
            output = output[:MAX_BASH_OUTPUT] + f"\n... (truncated, {len(output)} total chars)"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "(command timed out after 30s)"
    except Exception as e:
        return f"(error: {e})"


def _exec_read_file(args: dict, cwd: Path) -> str:
    """Read a file with optional line range."""
    filepath = cwd / args["path"]
    if not filepath.exists():
        return f"File not found: {args['path']}"
    try:
        lines = filepath.read_text().splitlines()
        start = args.get("start_line", 1) - 1
        end = args.get("end_line", len(lines))
        selected = lines[start:end]
        numbered = [f"{i+start+1:4d} | {line}" for i, line in enumerate(selected)]
        return "\n".join(numbered)
    except Exception as e:
        return f"Error reading file: {e}"


def _exec_write_file(args: dict, cwd: Path) -> str:
    """Write content to a file."""
    filepath = cwd / args["path"]
    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(args["content"])
        return f"File written: {args['path']} ({len(args['content'])} bytes)"
    except Exception as e:
        return f"Error writing file: {e}"


def _exec_submit_patch(args: dict, cwd: Path) -> str:
    """Capture git diff as the final patch."""
    try:
        result = subprocess.run(
            ["git", "diff"],
            cwd=cwd, capture_output=True, text=True, timeout=10,
        )
        diff = result.stdout.strip()
        if not diff:
            # Also check for new files
            result2 = subprocess.run(
                ["git", "diff", "--cached"],
                cwd=cwd, capture_output=True, text=True, timeout=10,
            )
            diff = result2.stdout.strip()

        if not diff:
            return "SUBMIT_EMPTY: No changes detected. Did you write the fix?"
        return f"SUBMIT_OK: {diff}"
    except Exception as e:
        return f"SUBMIT_ERROR: {e}"


# ─── Prompt ────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert software engineer fixing a bug in a real open-source repository.

You have tools to explore the codebase, read and write files, and run commands.

Strategy:
1. Read the issue carefully to understand the expected vs actual behavior
2. Use bash (grep, find) and read_file to locate the relevant code
3. Understand the root cause before writing any fix
4. Make the minimal change that fixes the issue
5. Verify your fix makes sense (check related tests if they exist)
6. Call submit_patch when done

Rules:
- Make the SMALLEST possible change. Do not refactor unrelated code.
- Do not modify test files unless the issue explicitly requires it.
- If unsure where the bug is, search systematically (grep for error messages, class names, function names from the issue).
- You have limited turns. Be efficient.
"""

PLAN_ADDENDUM = """
Before making changes, briefly plan:
- What is the root cause?
- Which file(s) need to change?
- What is the minimal fix?
"""


def build_user_prompt(instance: dict, config: RunConfig) -> str:
    """Build the initial user prompt for an instance."""
    parts = [
        f"## Repository: {instance['repo']}",
        f"## Base commit: {instance['base_commit']}",
        "",
        "## Issue Description",
        "",
        instance["problem_statement"],
        "",
        "## Instructions",
        "",
        "Fix this issue by exploring the codebase and making the necessary changes.",
        "When you are confident in your fix, call the `submit_patch` tool.",
    ]
    if config.plan_phase:
        parts.append("")
        parts.append(PLAN_ADDENDUM)
    return "\n".join(parts)


# ─── Repo Management ──────────────────────────────────────────────────────

def clone_and_checkout(instance: dict, work_dir: Path) -> Path:
    """Clone the repo at the specified commit."""
    repo = instance["repo"]
    base_commit = instance["base_commit"]
    repo_dir = work_dir / repo.replace("/", "__")

    if repo_dir.exists():
        shutil.rmtree(repo_dir)

    subprocess.run(
        ["git", "clone", f"https://github.com/{repo}.git", str(repo_dir)],
        capture_output=True, timeout=300, check=False,
    )
    subprocess.run(
        ["git", "checkout", base_commit],
        cwd=repo_dir, capture_output=True, timeout=30, check=False,
    )

    return repo_dir


# ─── Agent Loop ────────────────────────────────────────────────────────────

def run_agent(
    instance: dict,
    repo_dir: Path,
    config: RunConfig,
    client: Anthropic,
) -> str | None:
    """Run the agentic tool-use loop. Returns the patch or None."""
    instance_id = instance["instance_id"]
    model_id = MODEL_MAP.get(config.model, config.model)

    messages: list[dict[str, Any]] = [
        {"role": "user", "content": build_user_prompt(instance, config)},
    ]

    patch: str | None = None

    for turn in range(config.max_turns):
        try:
            kwargs: dict[str, Any] = {
                "model": model_id,
                "max_tokens": config.max_tokens,
                "system": SYSTEM_PROMPT,
                "messages": messages,
                "tools": TOOLS,
            }

            if config.thinking and turn == 0:
                kwargs["thinking"] = {"type": "enabled", "budget_tokens": 10000}

            response = client.messages.create(**kwargs)

        except Exception as e:
            console.print(f"    [red]API error on turn {turn}: {e}[/red]")
            break

        # Process response blocks
        assistant_content: list[dict[str, Any]] = []
        tool_results: list[dict[str, Any]] = []

        for block in response.content:
            if isinstance(block, TextBlock):
                assistant_content.append({"type": "text", "text": block.text})
            elif isinstance(block, ToolUseBlock):
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

                # Execute the tool
                result = execute_tool(block.name, block.input, repo_dir)

                # Check for patch submission
                if block.name == "submit_patch":
                    if result.startswith("SUBMIT_OK:"):
                        patch = result[len("SUBMIT_OK:"):].strip()
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": "Patch submitted successfully.",
                        })
                    else:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                        })
                else:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

        # Add assistant message
        messages.append({"role": "assistant", "content": assistant_content})

        # If patch was submitted, we're done
        if patch is not None:
            console.print(f"    [green]Patch submitted on turn {turn + 1}[/green]")
            return patch

        # If no tool use, model is done (shouldn't happen but handle it)
        if not tool_results:
            # Try to extract patch from text
            for block in response.content:
                if isinstance(block, TextBlock) and "diff --git" in block.text:
                    # Extract inline diff
                    lines = block.text.split("\n")
                    diff_lines = []
                    capture = False
                    for line in lines:
                        if line.startswith("diff --git"):
                            capture = True
                        if capture:
                            diff_lines.append(line)
                    if diff_lines:
                        patch = "\n".join(diff_lines)
                        return patch
            break

        # Add tool results
        messages.append({"role": "user", "content": tool_results})

        # Stop if model says stop
        if response.stop_reason == "end_turn" and not tool_results:
            break

    if patch is None:
        # Last resort: run git diff in case the agent wrote files but forgot to submit
        try:
            result = subprocess.run(
                ["git", "diff"], cwd=repo_dir,
                capture_output=True, text=True, timeout=10,
            )
            if result.stdout.strip():
                console.print(f"    [yellow]Auto-captured uncommitted diff[/yellow]")
                return result.stdout.strip()
        except Exception:
            pass

        console.print(f"    [yellow]No patch produced for {instance_id}[/yellow]")

    return patch


# ─── Checkpoint ────────────────────────────────────────────────────────────

def save_checkpoint(run_id: str, completed_ids: set[str]):
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    (CHECKPOINT_DIR / f"{run_id}.json").write_text(
        json.dumps({"completed_ids": list(completed_ids), "timestamp": time.time()}, indent=2)
    )


def load_checkpoint(run_id: str) -> set[str]:
    f = CHECKPOINT_DIR / f"{run_id}.json"
    if not f.exists():
        return set()
    return set(json.loads(f.read_text()).get("completed_ids", []))


# ─── Main ──────────────────────────────────────────────────────────────────

def run_evaluation(config: RunConfig):
    dataset_name = DATASET_MAP.get(config.dataset, config.dataset)
    run_id = config.run_id or f"protolabs-agent-{config.model}-{config.dataset}-{int(time.time())}"

    console.print(f"\n[bold]protoLabs SWE-bench Agentic Runner[/bold]")
    console.print(f"  Dataset:    {dataset_name}")
    console.print(f"  Model:      {MODEL_MAP.get(config.model, config.model)}")
    console.print(f"  Max turns:  {config.max_turns}")
    console.print(f"  Plan:       {'enabled' if config.plan_phase else 'disabled'}")
    console.print(f"  Thinking:   {'enabled' if config.thinking else 'disabled'}")
    console.print(f"  Run ID:     {run_id}\n")

    ds = load_dataset(dataset_name, split="test")
    instances = list(ds)

    if config.instance_ids:
        instances = [i for i in instances if i["instance_id"] in config.instance_ids]
    if config.max_instances > 0:
        instances = instances[:config.max_instances]

    console.print(f"  {len(instances)} instance(s) to evaluate\n")

    completed_ids = load_checkpoint(run_id) if config.resume else set()
    if completed_ids:
        console.print(f"  Resuming: {len(completed_ids)} already completed\n")

    client = Anthropic()

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    predictions_file = PREDICTIONS_DIR / f"{run_id}.jsonl"
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    completed = 0
    failed = 0
    skipped = 0
    start_time = time.time()

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
                skipped += 1
                progress.advance(task)
                continue

            progress.update(task, description=f"[cyan]{instance_id}[/cyan]")

            try:
                repo_dir = clone_and_checkout(instance, WORK_DIR)
            except Exception as e:
                console.print(f"  [red]Clone failed: {instance_id}: {e}[/red]")
                failed += 1
                progress.advance(task)
                continue

            patch = run_agent(instance, repo_dir, config, client)

            if patch:
                with open(predictions_file, "a") as f:
                    f.write(json.dumps({
                        "instance_id": instance_id,
                        "model_name_or_path": f"protolabs-agent-{config.model}",
                        "model_patch": patch,
                    }) + "\n")
                completed += 1
            else:
                # Write empty prediction so evaluation doesn't skip it
                with open(predictions_file, "a") as f:
                    f.write(json.dumps({
                        "instance_id": instance_id,
                        "model_name_or_path": f"protolabs-agent-{config.model}",
                        "model_patch": "",
                    }) + "\n")
                failed += 1

            completed_ids.add(instance_id)
            save_checkpoint(run_id, completed_ids)

            if repo_dir.exists():
                shutil.rmtree(repo_dir, ignore_errors=True)

            progress.advance(task)

    elapsed = time.time() - start_time

    table = Table(title="Run Summary")
    table.add_column("Metric", style="bold")
    table.add_column("Value", justify="right")
    table.add_row("Total", str(len(instances)))
    table.add_row("Patches produced", f"[green]{completed}[/green]")
    table.add_row("Failed / empty", f"[red]{failed}[/red]")
    table.add_row("Skipped (resumed)", str(skipped))
    table.add_row("Duration", f"{elapsed:.0f}s ({elapsed/60:.1f}m)")
    table.add_row("Predictions", str(predictions_file))
    console.print(table)

    console.print(f"\n[bold]Next:[/bold] Evaluate with the official harness:")
    console.print(f"  python -m swebench.harness.run_evaluation \\")
    console.print(f"    --dataset_name {dataset_name} \\")
    console.print(f"    --predictions_path {predictions_file} \\")
    console.print(f"    --max_workers 8 \\")
    console.print(f"    --run_id {run_id}\n")


def main():
    parser = argparse.ArgumentParser(description="protoLabs SWE-bench Agentic Runner")
    parser.add_argument("--dataset", choices=["lite", "verified", "full"], default="lite")
    parser.add_argument("--model", choices=["sonnet", "opus", "haiku"], default="sonnet")
    parser.add_argument("--max-tokens", type=int, default=16384)
    parser.add_argument("--max-turns", type=int, default=MAX_TURNS)
    parser.add_argument("--no-thinking", action="store_true")
    parser.add_argument("--no-plan", action="store_true")
    parser.add_argument("--instance-ids", nargs="+", default=[])
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--max-instances", type=int, default=0)

    args = parser.parse_args()

    config = RunConfig(
        dataset=args.dataset,
        model=args.model,
        max_tokens=args.max_tokens,
        thinking=not args.no_thinking,
        plan_phase=not args.no_plan,
        instance_ids=args.instance_ids,
        resume=args.resume,
        run_id=args.run_id,
        max_instances=args.max_instances,
        max_turns=args.max_turns,
    )

    run_evaluation(config)


if __name__ == "__main__":
    main()
