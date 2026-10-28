# Disci 

This is a web app project that is meant to help manage life things. 

- Read the project inspiration: docs/project_plans/project-inspiration.md
- Read the initial infra plan: docs/project_plans/disci-infrastructure.md

Development changes should be sure to update any relevant docs so that documentation does not go stale / innacurate. 

All documentation for this project lives: `docs/`

The `docs/docs-directory.md` file is the entry point that you can reference to understand the rest of the docs. 
After and/or while changes to the code are made, a sub-agent should be spun up to update any docs that would be affected.

## Cost

Disci runs in a personal AWS account and is meant to stay cheap (~$15/mo, nearly all RDS). Be cost-aware when developing:

- Before adding any AWS resource or anything that adds usage (a Lambda, alarm, custom metric, secret, log export, endpoint...), read `docs/ops/cost.md`. The free tier is shared across the whole account, so check its ledger first.
- Prefer designs with no fixed monthly cost. Call out anything that adds one before building it.
- Update `docs/ops/cost.md` in the same change (doc rule 7 in `docs/docs-directory.md`). 