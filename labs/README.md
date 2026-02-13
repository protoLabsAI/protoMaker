# Labs

Per-project audit trails for the setupLab pipeline. Each subdirectory tracks the full lifecycle of onboarding a project to the ProtoLabs gold standard.

## Structure

```
labs/
  {project-name}/
    audit.md          # Full audit trail (research → gaps → init → execution → verification)
```

## Workflow

1. **Run pipeline**: `run_full_setup` or `/setuplab` against target repo
2. **Create audit**: Document research results, gap analysis, alignment score
3. **Execute alignment**: Create features on the project's Automaker board, run agents
4. **Track progress**: Update execution log as features complete
5. **Verify**: Re-run pipeline, confirm score improvement
6. **Close**: Final score, total cost, lessons learned

## Active Labs

| Project      | Path                         | Score | Status      |
| ------------ | ---------------------------- | ----- | ----------- |
| protolabs.ai | `/Users/kj/dev/protolabs-ai` | 63%   | In progress |
