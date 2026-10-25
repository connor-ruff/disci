# Disci: Infrastructure & Cost Overview

*Project name: **Disci** (short for discipline). Code/resource name: `disci`. Draft as of Oct 25, 2026. Prices are AWS on-demand list prices for us-east-1.*

## 1. What we're building

A single web app that replaces EveryDollar, the bills checklist, the to-do sheet and the nutrition sheets. It has three ways in:

- **Web UI**: live dashboards and manual input forms.
- **MCP server**: lets Claude read and write the same data ("I had an apple").
- **Scheduled jobs**: morning and night summary reports.

All three go through **one API**, which is the only thing that talks to the database.

```
  Browser ──► CloudFront ──► S3 (static React app)
     │
     └──────► API Gateway (HTTP API) ──► Lambda: api  ──┐
  Claude ───► API Gateway  /mcp ───────► Lambda: mcp ──┤──► RDS Postgres
  EventBridge Scheduler ───────────────► Lambda: jobs ─┘     (private subnet)
                                              │
                                              └──► SES (report emails)
  Cognito ── issues logins / OAuth tokens for the web app and the MCP connector
```

Snowflake is **not** in v1. It gets added later as a reporting layer (nightly export to S3, then Snowpipe), with no changes to the app.

## 2. Accounts needed

| Account | New? | Notes |
|---|---|---|
| AWS | No, use your existing account | Isolated by separate Terraform state plus `project=disci` tags, so it can move to its own account later. |
| GitHub | No | Two repos: your existing IaC repo and a new app repo. GitHub Actions deploys to AWS through OIDC (no stored AWS keys). |
| Domain registrar | Optional | Route 53 can register the domain, which keeps everything in AWS. |
| Claude | No | The MCP server is added as a custom connector on your existing plan. |
| USDA FoodData Central | Optional, free | API key for food lookups. Claude can also look foods up itself and pass nutrients to the API. |

**Everything runs on AWS.** No other cloud or SaaS vendor is required.

## 3. Repos

### 3a. Existing IaC repo (Terraform): new project root

```
iac/
  modules/                     # shared building blocks (reuse or add)
  projects/
    disci/
      backend.tf               # its OWN state key → isolated blast radius
      providers.tf             # default_tags { project = "disci" }
      variables.tf             # account_id, region, domain, etc.
      network.tf               # VPC, private subnets, security groups
      database.tf              # RDS Postgres
      auth.tf                  # Cognito user pool + app clients
      compute.tf               # Lambdas (api, mcp, jobs, migrator), ECR
      api.tf                   # API Gateway HTTP API, routes, custom domain
      frontend.tf              # S3 bucket + CloudFront + ACM cert
      schedules.tf             # EventBridge Scheduler (morning/night reports)
      email.tf                 # SES domain identity
      ci.tf                    # GitHub OIDC role for the app repo's deploys
      outputs.tf               # values written to SSM Parameter Store
```

Terraform owns the *slots*. Lambda resources use `lifecycle { ignore_changes = [image_uri] }` so app deploys aren't reverted by a later `terraform apply`.

### 3b. New app repo (monorepo)

```
disci/
  db/
    migrations/                # versioned SQL (dbmate/Flyway), or schema/ for Atlas
  api/                         # FastAPI: routes, business logic, validation
    app/
      domains/                 # finance/, tasks/, nutrition/
      core/                    # auth, db session, settings (reads SSM)
    tests/
  mcp/                         # MCP server (streamable HTTP, stateless); calls api/
  jobs/                        # report builders invoked by EventBridge
  web/                         # React + Vite SPA (static build → S3)
  .github/workflows/
    deploy.yml                 # build images → push ECR → update Lambdas
                               # → run migrator → build web → sync S3 → invalidate CF
```

### 3c. Existing Snowflake repo

No changes for v1. Later it gets a `DISCI` database folder (raw tables, Snowpipe, reporting views).

## 4. AWS services used

| Service | Role | Notes |
|---|---|---|
| RDS for PostgreSQL | Source of truth | db.t4g.micro, single-AZ, 20 GB gp3, private subnet |
| Lambda | api, mcp, jobs, migrator | Container images; in the VPC so they can reach RDS |
| API Gateway (HTTP API) | Public HTTPS entry point | HTTP API, not REST API (~3.5× cheaper) |
| Cognito | User accounts, OAuth for the MCP connector | Essentials/Lite tier |
| S3 + CloudFront | Hosts the static frontend | ACM certificate is free |
| EventBridge Scheduler | Morning/night reports, recurring-task generation | |
| SES | Sends report emails | |
| SSM Parameter Store | Config handoff from Terraform to the app | Standard parameters are free |
| ECR | Lambda container images | |
| CloudWatch Logs | Logs and basic alarms | |
| Route 53 | DNS (optional domain) | |
| AWS Budgets | Alert if spend exceeds ~$25/mo | First budgets are free |

### Networking decision (the main cost trap)

Lambdas run in the VPC's private subnets next to RDS, with **no NAT Gateway** (~$33/mo idle on its own). That works because:
- Lambdas only need to reach RDS. They authenticate with **RDS IAM auth**, whose tokens are signed locally, so there's no Secrets Manager call and no internet needed.
- Logs flow through the Lambda service itself, with no VPC endpoint required.
- Food lookups happen on the Claude side or in a separate non-VPC Lambda.
- **Migrations** run through a small `migrator` Lambda that CI invokes. No bastion is needed for deploys.
- **Ad-hoc SQL from your laptop**: a bastion EC2 you start only when needed (SSM port forwarding), or temporarily flip RDS to public access with your IP allow-listed. *Open decision.*

## 5. Estimated monthly cost (single user)

| Item | Est. $/mo | Basis |
|---|---|---|
| RDS db.t4g.micro (compute) | ~$11.68 | $0.016/hr on-demand |
| RDS storage (20 GB gp3) | ~$2.30 | $0.115/GB-mo; backups up to DB size are free |
| Lambda | $0 | Always-free tier: 1M requests + 400K GB-s/mo |
| API Gateway HTTP API | ~$0.01 | $1.00 per million requests |
| Cognito | $0 | 10,000 MAU free (Lite/Essentials) |
| S3 + CloudFront | ~$0 | Well within free allowances |
| EventBridge Scheduler | $0 | 14M invocations/mo free |
| SES | ~$0.01 | ~60 emails/mo at $0.10 per 1,000 |
| ECR | ~$0.10 | ~1 GB of images |
| CloudWatch Logs | ~$0 | 5 GB/mo free |
| Route 53 hosted zone + domain | ~$1.50 | $0.50/mo zone + ~$12–15/yr domain (optional) |
| **Total** | **~$15–16/mo** | **~$12/mo with a 1-yr RDS reserved instance** |

**Costs this design deliberately avoids:**

| Thing | Cost if added | Why avoided |
|---|---|---|
| NAT Gateway | ~$33/mo + $0.045/GB | Not needed (see networking above) |
| Public IPv4 on anything | $3.60/mo per IP | RDS stays private |
| VPC interface endpoints | ~$7/mo each per AZ | IAM auth removes the need |
| REST API instead of HTTP API | 3.5× request cost | HTTP API is enough |
| Multi-AZ RDS | ~2× RDS cost | Not worth it for one user; nightly snapshots suffice |

**Watch item:** t4g instances run in "unlimited" CPU mode, so sustained high CPU accrues extra charges. That's unlikely at this scale, but a Budgets alert will catch it.

### If other users join later

Roughly flat until hundreds of active users: Lambda, API Gateway and Cognito stay at or near free, and RDS might step up to db.t4g.small (~$23/mo). Moving to Snowflake for reporting adds Snowflake credits, which mostly depend on how often loads and queries run.

## 6. Open questions to settle during build

1. **MCP auth with Cognito.** Cognito doesn't support OAuth dynamic client registration. Verify that Claude's custom connector setup accepts a pre-registered client ID/secret, or put a thin auth shim in front.
2. **Ad-hoc database access method** (bastion on demand vs. temporary public access).
3. **Migration tool**: Atlas (declarative, closest to your Snowflake repo style) vs. dbmate/Flyway (hand-written migrations).
4. **Report delivery**: email via SES (deterministic, cheap) vs. Claude scheduled tasks (conversational), or both.
5. **Domain name.**