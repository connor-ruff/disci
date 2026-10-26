# Deployment & Operations

*Status: **live in production** since Oct 25, 2026 (first deploy). This is the source of truth for what was actually built on AWS and how to operate it. The original plan, [disci-infrastructure.md](../project_plans/disci-infrastructure.md), explains the reasoning and costs but differs in places (see §10).*

| | URL |
|---|---|
| Web app | https://d2j30iivfr2al9.cloudfront.net |
| API | https://molrqp0ch5.execute-api.us-east-2.amazonaws.com (`GET /health` is open; everything else needs a login) |

Account: the `connor-ruff-dev-acct` AWS profile. Region: **us-east-2** for everything (CloudFront is global).

---

## 1. Architecture as built

```
  Browser ──► CloudFront (default *.cloudfront.net, OAC) ──► S3 (private bucket, static React build)
     │
     │  sign in: Cognito hosted login (code + PKCE) ──► ID token
     │
     └─ Authorization: Bearer <ID token>
          ──► API Gateway HTTP API ──[JWT authorizer: Cognito]──► Lambda disci-api (FastAPI + Mangum)
               (10 rps throttle; GET /health open)                      │ IAM auth token, user disci_api
                                                                        ▼
  ┌──────────── private VPC 10.42.0.0/16, 2 subnets, NO internet gateway, NO NAT ────────────┐
  │   Lambda disci-api ──────────►  RDS Postgres 18 (db.t4g.micro, single-AZ, IAM auth)     │
  │   Lambda disci-migrator ─────►  (master user disci; runs roles.sql + dbmate)            │
  │   Lambda disci-jobs ─────────►  (user disci_api, IAM auth; RLS per user)                │
  │   EC2 Instance Connect Endpoint ──► RDS :5432 (laptop tunnel)                           │
  └──────────────────────────────────────────────────────────────────────────────────────────┘

  EventBridge Scheduler (rate 1 hour, 2 retries) ──► Lambda disci-jobs (app.jobs.recurring.handler)

  Deploy (laptop or GitHub Actions via OIDC role disci-github-deploy):
    reads SSM /disci/prod/* → updates + invokes migrator → updates api + jobs → builds web → S3 sync → CloudFront invalidation
```

Nothing inside the VPC needs the internet, which is why there is no NAT (~$33/mo saved):
- API Gateway verifies Cognito JWTs **before** invoking the API, so the Lambda never fetches JWKS.
- RDS IAM auth tokens are **signed locally** with the Lambda's role (no AWS API call).
- Config arrives as **Lambda environment variables**, not SSM reads.
- Logs go out through the Lambda service itself.

Not built yet: the MCP server, the report jobs, SES report emails, a custom domain (see §9). The first scheduled job, hourly recurring-transaction generation, is built (§2.1).

---

## 2. Resources

All infrastructure is **OpenTofu** in the IaC repo, root `aws_iac_mngr/controlled_resources/disci/` (one state, key `disci/terraform.tfstate`). Its `disci.md` is the per-file index. Every resource is tagged `project = disci`.

| File | What it creates |
|---|---|
| `network.tf` | Private-only VPC (10.42.0.0/16, 2 subnets, no IGW/NAT), security groups (Lambda → RDS :5432, EICE → RDS :5432), EC2 Instance Connect Endpoint |
| `database.tf` | RDS Postgres 18, db.t4g.micro, 20 GB gp3, encrypted, IAM auth on, 7-day backups, deletion protection, final snapshot. Master password from `random_password` |
| `auth.tf` | Cognito user pool (email usernames, **self-signup off: invite-only**, deletion protection), hosted login domain, public web client (code + PKCE, no secret; ID/access tokens 60 min, refresh 30 days), the admin user (`admin_email`) and one user per address in `invited_emails` |
| `compute.tf` | `disci-api`, `disci-migrator` and `disci-jobs` Lambdas (arm64, Python 3.13, zip, 512 MB; 15 s / 300 s / 120 s timeouts), their IAM roles, 14-day log groups. Created with **placeholder code**; `ignore_changes = [filename, source_code_hash]` so app deploys never show as drift |
| `schedules.tf` | EventBridge Scheduler: the hourly `disci-recurring-transactions` schedule targeting `disci-jobs`, and the `disci-scheduler` role it assumes (may only `lambda:InvokeFunction` on `disci-jobs`) |
| `api.tf` | HTTP API, CORS for the web origin, Cognito JWT authorizer on `$default`, open `GET /health`, throttle 10 rps / burst 20 |
| `frontend.tf` | Private S3 bucket + CloudFront (Origin Access Control, SPA fallback: 403/404 → `/index.html` with 200, managed security-headers policy, default certificate) |
| `ci.tf` | `disci-github-deploy` role (GitHub OIDC; see §7) |
| `budget.tf` | $25/mo AWS Budgets alert filtered on `project=disci` (see §8) |
| `outputs.tf` | Deploy config published to SSM `/disci/prod/*` (non-secret); outputs incl. `eice_id`, `rds_endpoint`, `db_master_password` (sensitive) |

The account-wide GitHub OIDC provider lives separately in `aws_iac_mngr/admin_resources/github_oidc/` and must be applied before the disci root.

**Lambda environment** (set by tofu, not by the deploy):

| Lambda | Variables |
|---|---|
| `disci-api` | `DISCI_ENV=prod`, `DISCI_AUTH_MODE=cognito`, `DISCI_DB_IAM_AUTH=true`, `DISCI_DATABASE_URL=postgresql://disci_api@<rds>/disci?sslmode=require` (no password), `DISCI_CORS_ORIGINS=["<web origin>"]` |
| `disci-migrator` | `DISCI_MIGRATOR_DATABASE_URL` (master user `disci` with its password) |
| `disci-jobs` | The same variables as `disci-api` (copied from it in `compute.tf`) |

**SSM `/disci/prod/*`** (read only by the deploy script): `region`, `api_url`, `web_url`, `web_bucket`, `cloudfront_distribution_id`, `cognito_user_pool_id`, `cognito_client_id`, `cognito_domain`, `lambda_api_name`, `lambda_migrator_name`, `lambda_jobs_name`.

### 2.1 Scheduled jobs (`disci-jobs`)

| Piece | Details |
|---|---|
| Lambda | `disci-jobs`, handler `app.jobs.recurring.handler`, in the private subnets with the API's security group, 512 MB, **120 s** timeout. Same zip as the API. |
| Trigger | EventBridge Scheduler schedule `disci-recurring-transactions`, `rate(1 hour)`, flexible time window off, **2 retries**. Hourly so each user's transactions appear soon after midnight in their own timezone. The job is idempotent, so retried or extra runs are harmless. |
| IAM | Role `disci-jobs-lambda`: VPC access execution role plus `rds-db:connect` as **`disci_api`** (the same policy as the API). The scheduler's role `disci-scheduler` trusts `scheduler.amazonaws.com` (scoped to this account) and may only invoke `disci-jobs`. |
| Database | Connects as `disci_api` with IAM auth (no password), so RLS applies. It finds users through the narrow `SECURITY DEFINER` function `finance.users_with_recurring()` and then works one user at a time with `app.user_id` set, one transaction per user (see [api-overview.md §9.1](../api/api-overview.md)). |
| Logs | `/aws/lambda/disci-jobs`, 14 days. Each run logs how many users it processed and transactions it created. |

Run it by hand with `aws lambda invoke --function-name disci-jobs out.json`, or locally with `make jobs-recurring`.

---

## 3. How a deploy works

Code deploys are `scripts/deploy.sh`. It assumes the infrastructure already exists and only ships code; it never changes infrastructure.

1. **Read config** from SSM `/disci/prod/*` (function names, URLs, bucket, distribution, Cognito ids).
2. **Build the Lambda zip** with `scripts/build-api-zip.sh` → `build/api.zip`. One zip serves all three Lambdas and contains:
   - Python dependencies, installed **without Docker** as Linux arm64 wheels: `uv export --frozen --no-dev` then `uv pip install --target ... --python-platform aarch64-manylinux_2_28 --python-version 3.13 --only-binary :all:`.
   - `api/app` (handlers `app.lambda_handler.handler`, `app.migrator.handler` and `app.jobs.recurring.handler`).
   - `db/migrations` and `db/aws` (`roles.sql`).
   - The `dbmate` 2.36.0 linux-arm64 binary at `bin/dbmate`, **SHA256-pinned** (cached under `build/cache/`; a checksum mismatch aborts the build).
3. **Migrate**: upload the zip to `disci-migrator`, wait for the update, invoke it. The migrator runs `db/aws/roles.sql` (idempotently ensures `disci_app` and `disci_api`, grants `rds_iam`) and then `dbmate up`. If the invoke returns a `FunctionError`, the script **stops**: the API and web are not updated.
4. **Update the API and jobs**: upload the same zip to `disci-api`, then to `disci-jobs`, waiting for each.
5. **Build the web app**: `npm ci` and `npm run build` with `VITE_API_URL`, `VITE_AUTH_MODE=cognito`, `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID` and `VITE_COGNITO_DOMAIN` taken from SSM.
6. **Publish**: `aws s3 sync` of `dist/assets/` with `Cache-Control: public,max-age=31536000,immutable` (hashed filenames; old assets are kept so open tabs keep working), then the rest of `dist/` with `no-cache` and `--delete`.
7. **Invalidate** CloudFront for `/index.html` and `/` so the new build is picked up immediately.

**Migrations run before the API update**, so every migration must work with the API version that is currently live (expand/contract: add columns/tables first, remove old ones in a later release). Never edit a migration that has already run in production.

### From a laptop

```bash
AWS_PROFILE=connor-ruff-dev-acct scripts/deploy.sh
```

Needs `uv`, Node/npm, the AWS CLI, `zip` and `curl`. Deploys whatever is in your working tree, so prefer CI for normal changes.

### From CI (`.github/workflows/deploy.yml`)

- **`test` job** on every push and pull request: `make api-install web-install`, then `api-lint`, `api-test`, `web-check`.
- **`deploy` job** only on pushes to `main` (after `test` passes; also reachable with `workflow_dispatch` on `main`). It assumes `disci-github-deploy` through GitHub OIDC (`id-token: write`; no stored AWS keys) and runs `scripts/deploy.sh`.
- `concurrency: deploy-prod` with `cancel-in-progress: false`: one deploy at a time; a newer push waits.
- Third-party actions are **pinned to commit SHAs** (tag in a comment) so a moved tag can't change what runs with AWS credentials.

---

## 4. Infrastructure changes

Infrastructure is **not** deployed by CI. Change it in the IaC repo and apply by hand:

```bash
cd aws_iac_mngr/controlled_resources/disci
tofu plan -out=tfplan
tofu apply tfplan
```

- `terraform.tfvars` (gitignored) holds `admin_email` and `invited_emails`; copy from `terraform.tfvars.example` on a new machine. The IaC repo is public, so email addresses only ever go in this file, never in committed files.
- Lambda **code** never shows as drift (ignored), but Lambda **configuration** (env vars, memory, timeout) is owned by tofu. A new `DISCI_*` setting the API needs must be added in `compute.tf` and applied **before** the code that requires it is deployed.
- New deploy config for the script goes in `outputs.tf`'s `deploy_config` map (→ SSM). Nothing secret goes in SSM.
- If the deploy script needs a new AWS permission, add it to `ci.tf` (the deploy role is deliberately code-only).
- **Apply before deploy when the deploy script needs new infrastructure.** Example: the recurring-transactions change added `disci-jobs`, its schedule and the `lambda_jobs_name` SSM parameter. `deploy.sh` reads that parameter and updates `disci-jobs`, so the first deploy containing it fails at "Reading deploy config" until `tofu apply` has created them (and added `disci-jobs` to the deploy role in `ci.tf`). Apply first, then push or deploy.

### Cognito users

- Self-signup is off; the pool is **invite-only**. `auth.tf` creates the admin user from `admin_email` plus one user per address in `invited_emails` (a list, default empty), both set in the gitignored `terraform.tfvars`. `invited_emails` is not marked `sensitive` because OpenTofu can't `for_each` over sensitive values; it still only lives in that file.
- Each user gets an emailed **temporary password** (valid 7 days) and sets a real one at first sign-in on the hosted login page. Passwords: at least 12 chars with upper, lower and a number.
- **To invite someone**: add their email to `invited_emails` in `terraform.tfvars`, then `tofu plan -out=tfplan` and `tofu apply tfplan`.
- **If the temporary password expires** before they sign in, resend it (the pool id is in SSM at `/disci/prod/cognito_user_pool_id`). This is the only time to create users outside tofu:
  ```bash
  aws cognito-idp admin-create-user --user-pool-id <pool> --username <email> --message-action RESEND
  ```
- **Removing an email** from `invited_emails` and applying deletes that Cognito user, so they can no longer sign in. Their app data stays in Postgres.
- A new user starts with **no modules turned on**; they enable what they want from Manage modules.
- The API creates the `core.users` row on a user's first request, keyed by the Cognito `sub`.
- The web client's callback and logout URLs are only the CloudFront origin, so Cognito login does not work from `localhost`. Local development uses dev auth (no login).

---

## 5. Database access from a laptop

RDS is private. Tunnel through the EC2 Instance Connect Endpoint (no bastion, no hourly cost). Run from `aws_iac_mngr/controlled_resources/disci` so the `tofu output` calls work:

```bash
aws ec2-instance-connect open-tunnel \
  --instance-connect-endpoint-id $(tofu output -raw eice_id) \
  --private-ip-address $(dig +short $(tofu output -raw rds_endpoint) | tail -1) \
  --remote-port 5432 --local-port 5433 --profile connor-ruff-dev-acct --region us-east-2
# then, in another terminal (master user):
PGPASSWORD=$(tofu output -raw db_master_password) psql "host=localhost port=5433 dbname=disci user=disci sslmode=require"
```

Tunnels last up to 1 hour. The master user `disci` owns the schema and **bypasses row-level security**, so be careful with writes. The master password exists only in the encrypted tofu state and the migrator's environment; never copy it anywhere else.

---

## 6. Database roles in production

| Role | Login | Used by | Notes |
|---|---|---|---|
| `disci` | password (tofu `random_password`) | migrator Lambda, laptop psql | RDS master; owns the schema; runs migrations; bypasses RLS |
| `disci_app` | no | (group role) | Holds the table grants from migrations |
| `disci_api` | **IAM token only**, no password | API Lambda | Member of `disci_app` and `rds_iam`; owns nothing, so RLS applies |

`disci_app`/`disci_api` are created by `db/aws/roles.sql`, which the migrator runs on every deploy (idempotent). The API's pool uses `IamAuthConnection` (`api/app/core/rds_iam.py`): each **new** connection signs a fresh 15-minute token locally; already-open connections stay valid. The API Lambda's IAM role may only `rds-db:connect` as `disci_api`.

---

## 7. Security model

| Who | Can do | Enforced by |
|---|---|---|
| Anyone on the internet | Load the static web app; call `GET /health` | CloudFront; API Gateway route without authorizer |
| A signed-in Cognito user | Call any other API route, seeing only their own rows | API Gateway JWT authorizer (signature, expiry, issuer, audience = web client), then the API (requires `token_use == "id"` and an `email` claim), then Postgres RLS on `app.user_id` |
| New people | Cannot sign up; only invited emails get an account | Cognito self-signup off (invite-only); users created by tofu from `admin_email` and `invited_emails` |
| S3 bucket | Not public; readable only by this CloudFront distribution | Public access block + bucket policy on OAC `AWS:SourceArn` |
| API Lambda | Invoked only by this API Gateway; connects to RDS only as `disci_api` | Lambda permission scoped to the API's execution ARN; IAM `rds-db:connect` on `disci_api` |
| Jobs Lambda | Invoked by the scheduler role (also invokable by the deploy role and admins); connects to RDS only as `disci_api`, under RLS per user | `disci-scheduler` role may only invoke `disci-jobs`; IAM `rds-db:connect` on `disci_api`; the only cross-user read is `finance.users_with_recurring()` (ids and timezones) |
| RDS | Reachable only from the Lambda and EICE security groups; not publicly accessible | Security groups, private subnets, no IGW |
| GitHub Actions | Only `connor-ruff/disci` on `refs/heads/main` can assume `disci-github-deploy` | OIDC trust conditions on `aud` and `sub` |
| `disci-github-deploy` | Update/invoke the three Lambdas, write the web bucket, invalidate the distribution, read SSM `/disci/*`. **Cannot change infrastructure, IAM, or Lambda config** | `ci.tf` inline policy |
| Infrastructure changes | Only an admin with the `connor-ruff-dev-acct` profile, via `tofu apply` | Manual |

Because the Lambda can only be invoked by API Gateway, the claims in Mangum's `scope["aws.event"]` were already verified and cannot be forged by a client. The `X-Dev-User` header is ignored in `cognito` mode, and `DISCI_AUTH_MODE=dev` is refused at startup when `DISCI_ENV=prod`.

Web security headers come from CloudFront's managed `SecurityHeadersPolicy`. The web app keeps tokens in `localStorage` (see [web-overview.md](../ui/web-overview.md)), which trades some XSS exposure for staying signed in across tabs and restarts.

---

## 8. Cost

Expected **~$14–15/mo**, nearly all RDS (db.t4g.micro ~$11.68 + 20 GB gp3 ~$2.30). Lambda, API Gateway, Cognito, S3/CloudFront, SSM standard parameters, the Instance Connect Endpoint and CloudWatch Logs (14-day retention) are at or near free at this scale. No NAT, no public IPs, no interface endpoints, no ECR. Detailed breakdown: [disci-infrastructure.md §5](../project_plans/disci-infrastructure.md).

**Budget:** `disci-monthly`, $25/mo, emails `admin_email` at 80% actual and 100% forecast. It filters on the `project=disci` tag, which only works once the tag is **activated as a cost allocation tag**:

1. Wait until AWS lists the tag (up to ~24h after the first apply).
2. Billing and Cost Management → **Cost allocation tags** → find `project` under user-defined tags → **Activate**.

Until then the budget sees $0.

---

## 9. Known follow-ups

- **ID token vs access token (revisit for MCP).** The web app sends the Cognito **ID token** and the API requires `token_use == "id"`, because Cognito's access token has no `email` claim. That's a deliberate v1 choice. An MCP connector will most likely present access tokens, so the API will need to accept them (and look up email another way, or make it optional), and the authorizer's audience check (ID tokens carry `aud` = client id; access tokens carry `client_id`) needs revisiting. Cognito also lacks dynamic client registration ([open question 1](../project_plans/disci-infrastructure.md)).
- **Custom domain.** The app uses the default `*.cloudfront.net` and `execute-api` hostnames. A domain needs Route 53, an ACM certificate in **us-east-1** for CloudFront (plus an us-east-2 cert for an API custom domain), and updated Cognito callback/logout URLs and CORS origins.
- **Not built yet:** the MCP server, the report jobs (they'll be more handlers on `disci-jobs` or more schedules in `schedules.tf`) and SES report emails. Report delivery is still an open question.
- Cognito login from `localhost` (would need `http://localhost:5173` callback URLs on the client, or a second client).

---

## 10. Differences from the original plan

| Plan | As built | Why |
|---|---|---|
| Lambda container images in ECR | **Zip packages**, built without Docker (`uv pip install --python-platform aarch64-manylinux_2_28`) | No ECR, no Docker in CI, fast builds; the dependencies fit easily in a zip |
| `ignore_changes = [image_uri]` | `ignore_changes = [filename, source_code_hash]` with a tofu-managed placeholder | Same idea for zips |
| us-east-1 provider alias for CloudFront's ACM cert | None | No custom domain yet |
| Config handed to the app via SSM | SSM is read only by the **deploy script**; Lambdas get config from **environment variables** | Lambdas have no internet access and no SSM endpoint |
| API verifies Cognito JWTs | **API Gateway** verifies them; the API reads the verified claims | No JWKS fetch from inside the VPC |
| Lambdas api, mcp, jobs, migrator | api, migrator and jobs | MCP not built yet; jobs so far only generates recurring transactions |
