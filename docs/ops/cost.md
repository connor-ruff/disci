# Cost

What Disci costs to run, which free-tier allowances it relies on, and how much of each it uses. **Any change that adds an AWS resource or noticeably more usage updates this doc in the same change** (doc rule 7 in [docs-directory.md](../docs-directory.md)). The free tier is shared, so a new alarm or custom metric is only free while the account is under its limit.

Figures checked 2026-10-27.

---

## 1. Monthly cost

Expected **~$14.50/mo**.

| Service | What Disci has | Cost |
|---|---|---|
| RDS | `disci` db.t4g.micro, 20 GB gp3, 7-day backups | ~$11.68 instance + ~$2.30 storage. Backups up to the database's size are free. |
| RDS manual snapshots | Taken before risky migrations ([deployment.md](deployment.md) §3); never expire | Free while all backups and snapshots together fit in 20 GB (the provisioned storage); per GB-month beyond. Delete them once a deploy is confirmed good. |
| Secrets Manager | 1 secret (`disci-mcp-cognito-client-keys`) | $0.40/secret/mo |
| API Gateway (HTTP API) | 1 API (web app + MCP) | $1.00 per million requests; Disci makes a few thousand a month. No free tier (§2). |
| Everything else | Lambda, CloudWatch, SNS, EventBridge Scheduler, CloudFront, S3, Cognito, SSM standard parameters, the Instance Connect Endpoint | $0 inside the free tier (§3), or free outright |

**Kept out on purpose** (each is a fixed monthly cost): NAT gateways, public IPv4 addresses, interface VPC endpoints, ECR, KMS customer-managed keys.

## 2. The account

Disci runs in the `connor-ruff-dev-acct` account, which also runs other projects (other Lambdas, Lightsail, Route 53, more secrets). Two things follow:

- **Free-tier allowances are per account.** Disci shares them with everything else in it, so §3 lists the whole account's usage, not just Disci's.
- **The account is past its first 12 months.** Only the **Always Free** offers apply. The 12-month offers (API Gateway's 1M calls, RDS's 750 hours, and so on) don't, so those services bill from the first request.

## 3. Free-tier ledger

Always Free, per month, per account. "Account" is month-to-date usage on 2026-10-27, from the Free Tier API (§4) or a count of resources.

| Allowance | Limit | Disci | Account | Beyond the limit |
|---|---|---|---|---|
| CloudWatch alarms (standard resolution) | 10 | 4 (`alarms.tf`) | 4 | $0.10/alarm/mo |
| CloudWatch custom metrics | 10 | 1 (`Disci/RecurringFailures`, from the metric filter; it appears on the first match) | 0 so far | $0.30/metric/mo |
| CloudWatch Logs: ingestion | 5 GB | ~1 MB so far (4 log groups) | ~1 MB | $0.50/GB |
| CloudWatch Logs: storage, and data scanned by Logs Insights | 5 GB-mo | ~1 MB (14-day retention) | ~1 MB | see the CloudWatch pricing page |
| CloudWatch API requests | 1M | ~0 | 2 | $0.01/1,000 |
| Lambda requests | 1M | ~720/mo from `disci-jobs`, plus API and MCP traffic | 2,428 | $0.20/million |
| Lambda compute | 400,000 GB-s | small (512 MB functions, mostly under 1 s) | 517 | per GB-second (Ohio arm64 rate on the Lambda pricing page) |
| EventBridge Scheduler invocations | 14M | ~720/mo (hourly recurring job) | 43 | $1.00/million |
| CloudFront data out | 1 TB | the web app | 0.004 GB | — |
| CloudFront requests | 10M | the web app | 215 | — |
| CloudFront invalidation paths | 1,000 | one batch per deploy | 54 | $0.005/path |
| SNS email deliveries | 1,000 | `disci-alarms`: one per alarm state change | — | not reported by the Free Tier API; see the SNS pricing page |
| Cognito | 10,000 MAU (Essentials) | a few users | — | not reported by the Free Tier API |

Before adding an alarm, custom metric or anything else on this list, check the **Account** column. If the change would go past a limit, put its cost in §1.

## 4. Checking costs

- **Free-tier usage** (free to call; reports every Always Free offer this account has touched):
  ```bash
  aws freetier get-free-tier-usage --region us-east-1 --profile connor-ruff-dev-acct
  ```
- **Spend by service**, month to date: Billing and Cost Management → Cost Explorer, grouped by Service. The CLI (`aws ce get-cost-and-usage`) costs **$0.01 per request**. Filter on tag `project = disci` for Disci alone. Tagged costs appear with up to a day's delay.
- **Resource counts**: CloudWatch → Alarms for alarms; CloudWatch → Metrics → Custom namespaces for custom metrics.

## 5. Guardrails

- **Budget:** `disci-monthly` (`budget.tf`), $25/mo, emails `admin_email` at 80% actual and 100% forecast. It filters on the `project=disci` tag, which only works once the tag is **activated as a cost allocation tag**:
  1. Wait until AWS lists the tag (up to ~24h after the first apply).
  2. Billing and Cost Management → **Cost allocation tags** → find `project` under user-defined tags → **Activate**.

  Until then the budget sees $0.
- **Log retention:** every Disci log group is created in OpenTofu with 14-day retention. A log group Lambda creates on its own never expires, so a new Lambda needs its log group in OpenTofu first (as in `compute.tf`).
- **API throttling:** 10 requests/s, burst 20 (`api.tf`), which caps what runaway traffic can cost.
