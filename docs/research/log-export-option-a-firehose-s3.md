# Option A: Firehose → S3 → Snowflake external table

*Researched 2026-10-27. Point-in-time, not kept current. Overview and comparison: [log-export-to-snowflake.md](log-export-to-snowflake.md).*

## 1. Shape

```
/aws/lambda/disci-{api,jobs,mcp,migrator}
        │  subscription filter (one per log group; forwards every new event)
        ▼
Amazon Data Firehose stream
        │  buffers, unpacks CloudWatch's gzipped batches, writes files
        ▼
S3 bucket   logs/2026/10/28/<file>.json.gz      (one JSON log line per row)
        ▲
Snowflake   storage integration → stage → external table (or a direct stage query)
```

## 2. The AWS pieces

| Piece | What it is | Notes |
|---|---|---|
| **Subscription filter** (×4) | A rule on a log group, like a metric filter, that forwards each matching event to a destination instead of counting it | Pattern `""` forwards everything. Each log group allows two subscription filters. |
| **IAM role: CloudWatch Logs → Firehose** | Lets `logs.amazonaws.com` put records into the stream | Trust is limited to this account's log groups. |
| **Firehose stream** | AWS's managed delivery service: buffers incoming records and writes them out in batches | Source: Direct PUT. Destination: S3. Enable **decompression** and **message extraction** for CloudWatch Logs, so files hold our JSON lines instead of CloudWatch's gzipped envelopes. Buffer up to 15 minutes / 128 MB, so a quiet hour yields a few small files. |
| **IAM role: Firehose → S3** | Lets Firehose write to the bucket | |
| **S3 bucket** | The archive | A time-based prefix such as `logs/!{timestamp:yyyy}/!{timestamp:MM}/!{timestamp:dd}/` is part of the normal prefix setting. *Dynamic partitioning* (by a field inside the record) is a separately billed feature and isn't needed. |
| **Lifecycle rule** | Deletes or archives files after N days | This sets the retention, independent of CloudWatch's 14 days. |

**Open detail:** if the four log groups share one stream, message extraction drops CloudWatch's `logGroup` field, and our JSON lines don't name the function. Options: one stream per log group (more resources), keep the envelope and flatten it in Snowflake, or add a `service` field to every log line in the app.

## 3. The Snowflake pieces

- **Storage integration.** The existing `S3_FULL_INT` (`connors_snowflake_db/snowflake_admin/storage_integration/s3_full_int.sql`) uses the role `s3-read-access-for-aws-accounts` and an allow-list of three buckets. The new bucket would be added to `STORAGE_ALLOWED_LOCATIONS`, and that role's policy would need to read it.
- **Stage** on `s3://<bucket>/logs/`, with a JSON file format.
- **External table** partitioned by the date in the path, with **`AUTO_REFRESH = FALSE`**. Auto-refresh is charged for each batch of new-file notifications. Run `ALTER EXTERNAL TABLE … REFRESH` before an occasional query instead.
- **Or no external table at all**: query the stage directly when needed, e.g. `select $1:path, $1:status from @disci_logs/2026/10/ (file_format => 'json_ff')`.

## 4. Cost

- **Firehose:** charged per GB ingested, with each record rounded up to 5 KB. CloudWatch sends events in batches, so the rounding barely matters. At Disci's volume (a few MB a month) this is fractions of a cent. Decompression may carry its own small per-GB charge (to confirm on the Firehose pricing page). No fixed monthly cost.
- **S3:** a few MB, effectively $0. PUT requests are a few thousand a month.
- **Snowflake:** warehouse time only when querying, plus refresh metadata for the external table if used.
- Every piece goes into [cost.md](../ops/cost.md) if built.

## 5. Trade-offs

- **For:** well-trodden on both sides, files we fully control, retention independent of CloudWatch, nothing new or unusual.
- **Against:** the most AWS resources of any option (stream, bucket, filters, roles), and the log-group-name detail in §2 to solve.

## 6. Other routes considered

- **CloudWatch export tasks** (`CreateExportTask`), run nightly: no Firehose, but only one export task can run per account at a time, and the output is CloudWatch's text format (timestamp + message). Clumsy compared with Firehose.
- **A nightly Lambda** reading the previous day's events and writing NDJSON to S3: full control of the format, but it's code to own, and it's billed per CloudWatch API call.
