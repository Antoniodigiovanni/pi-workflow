import type { WorkflowPolicy } from "../../src/policy.ts";

const ARTIFACT_PATH = /^[A-Za-z0-9][A-Za-z0-9._ /+=-]{0,999}$/;
const TEXT_ARTIFACT = /\.(?:json|txt|md|yaml|yml|log)$/i;

export function assertMlflowMetadataAllowed(policy: WorkflowPolicy): void {
	if (!policy.mlflow.enabled) throw new Error("MLflow access is disabled by workflow.yaml");
	if (!policy.data_policy.allow_schema_metadata) throw new Error("MLflow metadata access is disabled by project policy");
	if (policy.mlflow.allowed_experiments.length === 0) throw new Error("No MLflow experiments are allowlisted in workflow.yaml");
}

export function assertExperimentAllowed(policy: WorkflowPolicy, experimentId: string): void {
	assertMlflowMetadataAllowed(policy);
	if (!policy.mlflow.allowed_experiments.includes(experimentId)) throw new Error("MLflow experiment is outside the exact project allowlist");
}

export function normalizeArtifactPath(path: string): string {
	if (!ARTIFACT_PATH.test(path) || path.includes("\\") || path.includes("//")) throw new Error("Artifact path must be a bounded run-relative path");
	const segments = path.split("/");
	if (segments.some((segment) => segment === "." || segment === ".." || segment.length === 0)) throw new Error("Artifact path traversal is not allowed");
	return segments.join("/");
}

export function assertArtifactAllowed(policy: WorkflowPolicy, path: string): string {
	assertMlflowMetadataAllowed(policy);
	if (!policy.mlflow.allow_artifacts) throw new Error("MLflow artifact access is disabled by workflow.yaml");
	const normalized = normalizeArtifactPath(path);
	if (!policy.mlflow.allowed_artifact_paths.includes(normalized)) throw new Error("Artifact path is outside the exact project allowlist");
	return normalized;
}

export function assertArtifactListPathAllowed(policy: WorkflowPolicy, path: string): string {
	assertMlflowMetadataAllowed(policy);
	if (!policy.mlflow.allow_artifacts) throw new Error("MLflow artifact access is disabled by workflow.yaml");
	if (path === "") return path;
	const normalized = normalizeArtifactPath(path);
	if (!policy.mlflow.allowed_artifact_paths.some(allowed => allowed === normalized || allowed.startsWith(`${normalized}/`))) {
		throw new Error("Artifact listing path does not contain an exactly allowlisted artifact");
	}
	return normalized;
}

export function artifactVisible(policy: WorkflowPolicy, path: string, directory: boolean): boolean {
	return directory
		? policy.mlflow.allowed_artifact_paths.some(allowed => allowed.startsWith(`${path}/`))
		: policy.mlflow.allowed_artifact_paths.includes(path);
}

export function assertTextArtifact(path: string): void {
	if (!TEXT_ARTIFACT.test(path)) throw new Error("Only approved JSON, text, Markdown, YAML, or log artifacts can be read");
}
