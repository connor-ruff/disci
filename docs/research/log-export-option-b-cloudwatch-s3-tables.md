# Option B: CloudWatch Logs S3 Tables integration → Snowflake (preferred)

*Researched 2026-10-27. Point-in-time, not kept current. Overview and comparison: [log-export-to-snowflake.md](log-export-to-snowflake.md).*

## 1. Shape

```
/aws/lambda/disci-{api,jobs,mcp,migrator}   (tagged cw:datasource:name / :type)
        │  CloudWatch's S3 Tables integration (managed by AWS; launched December 2025)
        ▼
S3 table bucket "aws-cloudwatch"  (AWS-managed, read-only)
   namespace "logs" → Iceberg tables disci_api__lambda, disci_jobs__lambda, ...
        ▲
Snowflake   catalog integration (Iceberg REST, S3 Tables endpoint, SigV4, vended credentials)
            → catalog-linked database, or individual Iceberg tables
```

## 2. The CloudWatch side

What the integration does, from the CloudWatch Logs docs:

- It creates an AWS-managed S3 **table bucket** named `aws-cloudwatch`, and mirrors the log data from associated "data sources" into **Apache Iceberg** tables in it.
- **No additional cost:** "no additional storage or table maintenance charges … beyond existing CloudWatch ingestion and storage pricing."
- **Retention follows the log group.** At 14 days, the Iceberg copy is also 14 days. Deleting a log group or stream deletes its rows.
- **No backfill:** only events received after the association is created.
- **Which logs:** at creation, a checkbox ("Enable all log sources and types…", on by default) includes every data source in the account, including future ones. **Uncheck it** and associate only Disci's four: the account also runs other projects ([cost.md §2](../ops/cost.md)).

Details from a write-up that did this with Lambda logs (Classmethod, linked below):

- **Tags are required.** Each log group needs `cw:datasource:name` and `cw:datasource:type = lambda`, or nothing flows. The name allows only lowercase letters, numbers and underscores, so `disci_api`, not `disci-api`. Uppercase or hyphens fail with an unhelpful `ValidationException`.
- **Tables:** namespace `logs`, one table per data source named `<name>__lambda` (e.g. `disci_api__lambda`), created on the first write.
- **Schema:** about 13 columns prefixed `cwl__`, including `cwl__message` (string), `cwl__data_source_name`, `cwl__data_source_type`, `cwl__logstreamid`, `cwl__loggroupid`, `cwl__data_format` and `cwl__source_log`. With Lambda's JSON log format, which Disci already uses, `cwl__message` is our JSON line. Without it, it's tab-separated text.
- **Latency:** a few minutes from log line to table.
- **Gotcha:** in the service role's trust policy, the log group ARN must **not** end in `:*`, or you get `S3TableIntegrationUnauthorized`.

**IAM for the CloudWatch side** (from the docs): a service role trusted by `logs.amazonaws.com` (conditions `aws:SourceAccount` and `aws:SourceArn` = the log groups), allowed `logs:integrateWithS3Table` on those log groups. The person creating it needs `observabilityadmin:CreateS3TableIntegration`, `logs:AssociateSourceToS3TableIntegration` and the `s3tables:` bucket permissions.

**Tooling gap:** the OpenTofu AWS provider Disci pins (5.100) has `aws_s3tables_*` resources but nothing for this integration, and the local AWS CLI (2.25) predates it. So the integration would be a **one-time console step**: CloudWatch → Settings → Global → Create S3 Table Integration. The tags and IAM roles would still be in OpenTofu. Moving to provider 6.x might add a resource, but that's a major upgrade of its own.

## 3. The Snowflake side

Snowflake reads S3 Tables natively, using a **catalog integration** (a different object from a storage integration), through S3 Tables' own Iceberg REST endpoint. From Snowflake's docs:

```sql
CREATE CATALOG INTEGRATION cloudwatch_logs_int
  CATALOG_SOURCE = ICEBERG_REST
  TABLE_FORMAT   = ICEBERG
  REST_CONFIG = (
    CATALOG_URI            = 'https://s3tables.us-east-2.amazonaws.com/iceberg'
    CATALOG_API_TYPE       = AWS_S3TABLES
    CATALOG_NAME           = '<ARN of the aws-cloudwatch table bucket>'
    ACCESS_DELEGATION_MODE = VENDED_CREDENTIALS
  )
  REST_AUTHENTICATION = (
    TYPE = SIGV4
    SIGV4_IAM_ROLE       = 'arn:aws:iam::676058464455:role/<snowflake-s3tables-read>'
    SIGV4_SIGNING_REGION = 'us-east-2'
  )
  ENABLED = TRUE;

DESCRIBE CATALOG INTEGRATION cloudwatch_logs_int;  -- AWS_IAM_USER_ARN, AWS_EXTERNAL_ID
```

- **IAM role for Snowflake:** a policy with `s3tables` **read** actions (`GetTableBucket`, `ListNamespaces`, `GetNamespace`, `ListTables`, `GetTable`, `GetTableMetadataLocation`, `GetTableData`) on the bucket and `bucket/aws-cloudwatch/table/*`. Snowflake's example also lists write actions, which aren't needed here. The trust policy allows Snowflake's `AWS_IAM_USER_ARN` with `sts:ExternalId` = `AWS_EXTERNAL_ID`. It's the same two-pass setup as `S3_FULL_INT`. Snowflake uses one IAM user per account for all SigV4 catalog integrations, and `CREATE OR REPLACE` on the integration changes the external ID.
- **No external volume** (vended credentials supply short-lived storage credentials) and **no Lake Formation** on this route.
- **Limitations:** CTAS isn't supported against the S3 Tables endpoint, and `VENDED_CREDENTIALS` is the only delegation mode.
- **Then either:**
  - **A catalog-linked database:** `CREATE DATABASE disci_logs LINKED_CATALOG = (CATALOG = 'cloudwatch_logs_int', ALLOWED_NAMESPACES = ('logs'));`. It discovers the tables and keeps them in sync.
  - **Or individual externally managed Iceberg tables**, one per `<name>__lambda`, with auto-refresh off and a manual refresh before querying.
- **Parsing:** views over `PARSE_JSON(cwl__message)`, e.g. `disci_requests` exposing `status`, `path`, `duration_ms`, `sub`, `caller_request_id`, `requestId`.
- **History beyond 14 days:** a Snowflake task every ~10 days copying new rows into a native table. CTAS isn't supported against the endpoint, so use `INSERT … SELECT` into a pre-created table.
- **Where the DDL would live:** `connors_snowflake_db`: `snowflake_admin/` for the catalog integration (next to `storage_integration/`), `snowflake_admin/database_setups/` for the database, `snowflake_objects/<db>/` for views and the snapshot task.

## 4. Cost

- **AWS:** $0 extra (see §2). The roles and tags are free. [cost.md](../ops/cost.md) would get a row saying so.
- **Snowflake:** warehouse time only when querying. **To confirm before choosing:** whether a catalog-linked database's background sync uses credits while idle. If it does, individual Iceberg tables with auto-refresh off cost nothing between uses.

## 5. Open risks

1. **Can an outside IAM role read the AWS-managed `aws-cloudwatch` bucket through the S3 Tables endpoint?** AWS calls the bucket read-only and documents only Athena and Redshift, through the Glue `s3tablescatalog` and Lake Formation. The Classmethod write-up queried it with IAM-only permissions from Athena, which is encouraging but not the same path as Snowflake's. **Fallback:** Snowflake's Glue Iceberg REST route, which uses Lake Formation grants (SELECT and DESCRIBE on the `aws-cloudwatch` tables) and vended credentials.
2. **No backfill,** and retention is coupled to the log group. Both were accepted (§3 covers history).
3. **A new feature** (December 2025). Expect rough edges and doc gaps.

## 6. The test before committing

Cheap and reversible, about an hour:

1. OpenTofu: tag only `/aws/lambda/disci-jobs` (`cw:datasource:name = disci_jobs`, `cw:datasource:type = lambda`), and add the CloudWatch service role and the Snowflake read role.
2. Console: create the integration with "all sources" **unchecked**, then associate `disci_jobs` / `lambda`.
3. Wait for an hourly run; check the `logs.disci_jobs__lambda` table exists.
4. Snowflake: create the catalog integration, run `DESCRIBE`, finish the role's trust policy, create the linked database (or one Iceberg table), and `SELECT PARSE_JSON(cwl__message):message FROM … LIMIT 10`.
5. If it works, tag the other three log groups and write the views. If it fails at step 4, try the Glue/Lake Formation route, then option A.

## Sources

- [Access logs with S3 Tables Integration (CloudWatch Logs docs)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/s3-tables-integration.html)
- [The CloudWatch to S3 Tables mirror is not an archive: it expires with your log group (DEV Community)](https://dev.to/aws-builders/the-cloudwatch-to-s3-tables-mirror-is-not-an-archive-it-expires-with-your-log-group-9ok)
- [Lambda logs via the CloudWatch S3 Tables integration, with CDK (Classmethod, Japanese)](https://dev.classmethod.jp/articles/lambda-logs-s3-tables-cdk/)
- [Amazon S3 server access logs now deliver to CloudWatch Logs and S3 Tables (AWS What's New, June 2026)](https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-s3-cloudwatch-logs-tables/)
- [Configure a catalog integration for Amazon S3 Tables (Snowflake docs)](https://docs.snowflake.com/en/user-guide/tables-iceberg-configure-catalog-integration-rest-s3tables)
- [Use catalog-vended credentials for Apache Iceberg tables (Snowflake docs)](https://docs.snowflake.com/en/user-guide/tables-iceberg-configure-catalog-integration-vended-credentials)
- [Connect Snowflake to S3 Tables using the SageMaker Lakehouse Iceberg REST endpoint (AWS Storage Blog)](https://aws.amazon.com/blogs/storage/connect-snowflake-to-s3-tables-using-the-sagemaker-lakehouse-iceberg-rest-endpoint/)
- [Query Iceberg tables in SageMaker from Snowflake (AWS Big Data Blog)](https://aws.amazon.com/blogs/big-data/break-down-data-silos-and-seamlessly-query-iceberg-tables-in-amazon-sagemaker-from-snowflake)
- [Data lake using Apache Iceberg with Snowflake and AWS Glue (Snowflake guide)](https://www.snowflake.com/en/developers/guides/data-lake-using-apache-iceberg-with-snowflake-and-aws-glue)
