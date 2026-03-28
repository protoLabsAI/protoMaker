# SWE-bench Evaluation Harness

Runs protoLabs Studio's agent against the SWE-bench benchmark and produces predictions for evaluation.

## Setup

```bash
cd tools/swebench
pip install -r requirements.txt
```

Requires `ANTHROPIC_API_KEY` in your environment.

## Two Runners

### `agent_runner.py` (recommended)

Agentic tool-use loop. Claude gets `bash`, `read_file`, `write_file`, and `submit_patch` tools to explore the repo, understand the issue, and produce a fix. This matches the approach used by top SWE-bench entries.

```bash
# Single instance test
python agent_runner.py --instance-ids sympy__sympy-20590

# First 5 instances (quick validation)
python agent_runner.py --max-instances 5

# Full SWE-bench Lite run with Sonnet
python agent_runner.py --dataset lite --model sonnet

# Opus for harder problems
python agent_runner.py --dataset verified --model opus

# Ablation: no planning phase
python agent_runner.py --dataset lite --no-plan

# Resume after interruption
python agent_runner.py --dataset lite --resume --run-id <previous-run-id>
```

### `runner.py` (baseline)

Single-shot prompt, no tools. Useful as a lower-bound baseline to measure how much the agentic loop helps.

```bash
python runner.py --instance-ids sympy__sympy-20590
```

## Evaluating Predictions

After generating predictions, run the official SWE-bench evaluator:

```bash
python -m swebench.harness.run_evaluation \
    --dataset_name princeton-nlp/SWE-bench_Lite \
    --predictions_path predictions/<run-id>.jsonl \
    --max_workers 8 \
    --run_id <run-id>
```

Results appear in `evaluation_results/`.

## Ablation Studies

The runner flags make ablation easy:

| Flag                                 | Tests                                   |
| ------------------------------------ | --------------------------------------- |
| `--no-plan`                          | Skip planning phase (speed vs accuracy) |
| `--no-thinking`                      | Disable extended thinking               |
| `--model sonnet` vs `--model opus`   | Cost/accuracy tradeoff                  |
| `--max-turns 15` vs `--max-turns 30` | Agent budget vs thoroughness            |

## Cost Estimates

| Dataset  | Instances | Sonnet (est.) | Opus (est.)   |
| -------- | --------- | ------------- | ------------- |
| Lite     | 300       | ~$300-600     | ~$1,500-3,000 |
| Verified | 500       | ~$500-1,000   | ~$2,500-5,000 |

Costs depend on instance complexity and number of agent turns.
