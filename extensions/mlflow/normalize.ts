import type {
	MlflowArtifact,
	MlflowExperiment,
	MlflowMetric,
	MlflowParameter,
	MlflowRun,
	MlflowTag,
} from "./types.ts";

function record(value: unknown, field: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`MLflow returned malformed ${field}`);
	return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, max = 10_000): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) throw new Error(`MLflow returned malformed ${field}`);
	return value;
}

function optionalString(value: unknown, field: string, max = 10_000): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	return requiredString(value, field, max);
}

function optionalNumber(value: unknown, field: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`MLflow returned malformed ${field}`);
	return value;
}

function boundedArray(value: unknown, field: string, max = 2_000): unknown[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.length > max) throw new Error(`MLflow returned malformed or oversized ${field}`);
	return value;
}

function allowedKey(key: unknown, allowed: string[]): boolean {
	return typeof key === "string" && allowed.includes(key) && !/secret|token|password|credential|api.?key|private.?key/i.test(key);
}

function textValue(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length > 65_536) throw new Error(`MLflow returned malformed ${field}`);
	return value;
}

export function normalizeTags(value: unknown, allowed: string[] = []): MlflowTag[] {
	return boundedArray(value, "tags").filter(item => allowedKey(record(item, "tag").key, allowed)).map((item) => {
		const tag = record(item, "tag");
		return { key: requiredString(tag.key, "tag key", 250), value: textValue(tag.value, "tag value") };
	});
}

export function normalizeExperiment(value: unknown, allowed: string[] = []): MlflowExperiment {
	const experiment = record(value, "experiment");
	return {
		experimentId: requiredString(experiment.experiment_id, "experiment ID", 500),
		name: requiredString(experiment.name, "experiment name"),
		lifecycleStage: optionalString(experiment.lifecycle_stage, "lifecycle stage", 100),
		creationTime: optionalNumber(experiment.creation_time, "creation time"),
		lastUpdateTime: optionalNumber(experiment.last_update_time, "last update time"),
		tags: normalizeTags(experiment.tags, allowed),
	};
}

function normalizeMetrics(value: unknown): MlflowMetric[] {
	return boundedArray(value, "metrics").map((item) => {
		const metric = record(item, "metric");
		const number = optionalNumber(metric.value, "metric value");
		if (number === undefined) throw new Error("MLflow returned malformed metric value");
		return {
			key: requiredString(metric.key, "metric key", 250),
			value: number,
			timestamp: optionalNumber(metric.timestamp, "metric timestamp"),
			step: optionalNumber(metric.step, "metric step"),
		};
	});
}

function normalizeParameters(value: unknown, allowed: string[]): MlflowParameter[] {
	return boundedArray(value, "parameters").filter(item => allowedKey(record(item, "parameter").key, allowed)).map((item) => {
		const parameter = record(item, "parameter");
		return {
			key: requiredString(parameter.key, "parameter key", 250),
			value: textValue(parameter.value, "parameter value"),
		};
	});
}

export function normalizeRun(value: unknown, allowed: string[] = [], allowMetrics = true): MlflowRun {
	const run = record(value, "run");
	const info = record(run.info, "run info");
	const data = run.data === undefined ? {} : record(run.data, "run data");
	return {
		info: {
			runId: requiredString(info.run_id, "run ID", 500),
			experimentId: requiredString(info.experiment_id, "run experiment ID", 500),
			runName: optionalString(info.run_name, "run name"),
			status: optionalString(info.status, "run status", 100),
			startTime: optionalNumber(info.start_time, "run start time"),
			endTime: optionalNumber(info.end_time, "run end time"),
			lifecycleStage: optionalString(info.lifecycle_stage, "run lifecycle stage", 100),
		},
		data: {
			metrics: allowMetrics ? normalizeMetrics(data.metrics) : [],
			params: normalizeParameters(data.params, allowed),
			tags: normalizeTags(data.tags, allowed),
		},
	};
}

export function normalizeArtifact(value: unknown): MlflowArtifact {
	const artifact = record(value, "artifact");
	if (typeof artifact.is_dir !== "boolean") throw new Error("MLflow returned malformed artifact directory flag");
	const fileSize = optionalNumber(artifact.file_size, "artifact file size");
	if (fileSize !== undefined && (!Number.isInteger(fileSize) || fileSize < 0)) throw new Error("MLflow returned malformed artifact file size");
	return {
		path: requiredString(artifact.path, "artifact path", 1_000),
		isDirectory: artifact.is_dir,
		fileSize,
	};
}

export function responseRecord(value: unknown, field: string): Record<string, unknown> {
	return record(value, field);
}

export function responseArray(value: unknown, field: string, max = 2_000): unknown[] {
	return boundedArray(value, field, max);
}

export function responseToken(value: unknown): string | undefined {
	return optionalString(value, "page token", 10_000);
}
