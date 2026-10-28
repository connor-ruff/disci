# Research: getting Disci's logs into Snowflake

*Researched 2026-10-27. A point-in-time study, not kept current (doc rule 8). Nothing here is built. The decision is open on the [roadmap](../roadmap.md).*

## The goal

Query Disci's Lambda logs (the JSON lines described in [deployment.md §2.3](../ops/deployment.md)) from Snowflake with SQL. That gives history beyond CloudWatch's 14 days, dashboards, and joins with Disci's own data once that reaches Snowflake.

## What the solution has to fit

These came out of the discussion and decide between the options:

- **Lean AWS, analytics in Snowflake.** Keep AWS infrastructure minimal and do the reporting in Snowflake, where the owner is strongest.
- **Rarely queried.** The logs would be looked at once every few weeks, so continuously loading them into Snowflake pays for loading data nobody reads.
- **Compute only at query time.** The logs should stay in AWS, and Snowflake should spend credits only when someone queries.
- **14-day retention is fine.** CloudWatch retention stays at 14 days. If history is wanted, Snowflake copies new rows into its own table every ~10 days, which is a Snowflake-side choice.
- **Cost-aware.** Any AWS addition goes through [cost.md](../ops/cost.md).

## The options

| | A: Firehose → S3 → external table | B: CloudWatch S3 Tables integration (preferred) | Firehose → Snowflake directly (rejected) |
|---|---|---|---|
| How | Subscription filters stream each log group to Firehose, which writes gzipped JSON files to an S3 bucket. Snowflake reads them through an external table or a stage | CloudWatch mirrors chosen log groups into Iceberg tables in an AWS-managed S3 table bucket. Snowflake connects with an Iceberg REST catalog integration | Firehose delivers into a Snowflake table through Snowpipe Streaming |
| AWS infrastructure | Bucket, Firehose stream, 4 subscription filters, 2 IAM roles, lifecycle rule | Log group tags, 2 IAM roles, a one-time console step | Firehose stream, 4 subscription filters, IAM, Snowflake key pair |
| Data format | Files we control (one JSON line per row) | CloudWatch's Iceberg schema (`cwl__*` columns; our JSON in `cwl__message`) | Rows in a Snowflake table |
| Retention | Our own (S3 lifecycle) | Follows the log group (14 days); no backfill | In Snowflake |
| AWS cost | Pennies (Firehose per GB, S3 storage) | $0 extra, per AWS | Pennies |
| Snowflake cost | Only when querying (skip external table auto-refresh) | Only when querying (to confirm for catalog-linked databases) | Continuous loading plus Snowflake storage |
| Main risk | More moving parts to own | Whether an outside IAM role can read the AWS-managed bucket | None; rejected on cost model |
| Details | [option A](log-export-option-a-firehose-s3.md) | [option B](log-export-option-b-cloudwatch-s3-tables.md) | this page |

**Why not Firehose → Snowflake directly:** it's the simplest pipeline, but it loads continuously into data that's read every few weeks, and the data ends up stored in Snowflake rather than AWS. That's the opposite of "compute only at query time".

## Where it was left

**Option B was preferred**: no pipeline to own, Iceberg as the open format, no extra AWS cost, and a fit with "lean AWS, analytics in Snowflake". Before committing, it needs one cheap test, described in [option B §6](log-export-option-b-cloudwatch-s3-tables.md): tag only `disci-jobs`, create the integration, and run one `SELECT` from Snowflake. If the AWS-managed bucket refuses an outside role, the fallbacks are B through Lake Formation, or option A.

## Related

- The roadmap's **Snowflake reporting layer** (exporting Disci's *app data* to Snowflake) is a separate item. If it gets built, both could share the Snowflake database and IAM patterns.
- The owner's Snowflake objects live in the `connors_snowflake_db` repo, which has `snowflake_admin/` for account-level setup (an existing `S3_FULL_INT` storage integration in `snowflake_admin/storage_integration/`) and `snowflake_objects/` per database.
