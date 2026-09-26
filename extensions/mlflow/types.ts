export interface MlflowTag {
	key: string;
	value: string;
}

export interface MlflowExperiment {
	experimentId: string;
	name: string;
	lifecycleStage?: string;
	creationTime?: number;
	lastUpdateTime?: number;
	tags: MlflowTag[];
}

export interface MlflowMetric {
	key: string;
	value: number;
	timestamp?: number;
	step?: number;
}

export interface MlflowParameter {
	key: string;
	value: string;
}

export interface MlflowRun {
	info: {
		runId: string;
		experimentId: string;
		runName?: string;
		status?: string;
		startTime?: number;
		endTime?: number;
		lifecycleStage?: string;
	};
	data: {
		metrics: MlflowMetric[];
		params: MlflowParameter[];
		tags: MlflowTag[];
	};
}

export interface MlflowArtifact {
	path: string;
	isDirectory: boolean;
	fileSize?: number;
}

export interface MlflowPage<T> {
	items: T[];
	nextPageToken?: string;
}
