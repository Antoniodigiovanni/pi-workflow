# MLflow

MLflow access is disabled until `mlflow.enabled` is true and
`mlflow.allowed_experiments` contains exact experiment IDs. Empty allowlists grant
nothing. Metadata tools retrieve only those experiments, bounded active-run pages,
run metadata, parameters, latest metrics, tags, and comparisons. A run returned by
the service is rejected unless its experiment ID matches the approved request.

By default the client reuses `DATABRICKS_HOST` and the token/U2M authentication
described in [Databricks configuration](databricks.md).
For a separate tracking server, set `MLFLOW_TRACKING_URI` to an HTTPS origin or a
loopback HTTP origin and optionally set `MLFLOW_TRACKING_TOKEN`. Paths, embedded
credentials, query strings, and redirects are rejected.

Artifact names and content can expose rows, secrets, or internal findings.
`mlflow.allow_artifacts` is false by default. Listing returns only exact paths in
`allowed_artifact_paths` and the directories leading to them. Content reads also
require an approved `.json`, `.txt`, `.md`, `.yaml`, `.yml`, or `.log` path, a known
file size at most one megabyte, and bounded text chunks.

Databricks documents artifact listing but currently does not publish a generic REST
artifact-download endpoint. pi-workflow never follows `artifact_uri`, DBFS, S3, or
other storage schemes. Content reading is available only for a tracking server that
supports MLflow's documented presigned-download endpoint, after explicitly setting
`MLFLOW_ARTIFACT_DOWNLOAD_MODE=presigned`. The short-lived URL is fetched without the
tracking-server authorization header, is never returned, and cannot redirect.

Set `MLFLOW_ARTIFACT_ALLOWED_ORIGINS` to a comma-separated list of exact trusted
download origins (scheme, host, port; no path or wildcard). Empty denies downloads.
Do not approve private-network endpoints or hosts controlled by untrusted parties.
Origin approval is not DNS pinning; use network isolation for a stronger boundary.
Content lookup checks the first artifact-list page; use listing pagination to diagnose
a file missing from that page. Content may change between listing and download.

Internal tool calls require the current model in `data_policy.approved_models`.
Parameters and tags are returned only for exact keys in `mlflow.allowed_metadata_keys`
(default empty); credential-like keys are always omitted. Approve values as well as
names: an innocuous key can hold a secret. Storage URIs/locations are omitted.
`allow_aggregates: false` also withholds metrics. A run comparison aligns latest metric
keys; it does not retrieve history, validate metric definitions or establish statistical
significance. Dataset inputs, dependencies, model/prompt versions and artifacts still
need the committed experiment record and independent verification.

The implementation follows the current [Databricks MLflow API](https://docs.databricks.com/aws/en/reference/mlflow-api),
[run API](https://docs.databricks.com/api/experiments/v1/run),
[artifact API](https://docs.databricks.com/api/experiments/v1/artifact), and
[MLflow REST API](https://mlflow.org/docs/latest/api_reference/rest-api.html), inspected
on 2026-09-17. Tests use synthetic localhost services. No live tracking server,
Databricks workspace, or artifact store has been verified.
