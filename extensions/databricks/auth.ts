import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspaceUrl } from "../../src/http.ts";

const execFileAsync = promisify(execFile);

export interface DatabricksAuth {
	host: URL;
	token: string;
	source: "environment" | "databricks-cli";
}

export type AuthCommand = (file: string, args: string[]) => Promise<{ stdout: string }>;

async function defaultAuthCommand(file: string, args: string[]): Promise<{ stdout: string }> {
	try {
		const result = await execFileAsync(file, args, { timeout: 15_000, maxBuffer: 1_000_000, windowsHide: true });
		return { stdout: result.stdout };
	} catch {
		throw new Error("Databricks authentication failed; configure unified authentication or DATABRICKS_TOKEN");
	}
}

function parseCliToken(source: string): string {
	let value: unknown;
	try { value = JSON.parse(source); } catch { throw new Error("Databricks CLI returned an unreadable authentication response"); }
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Databricks CLI returned an unreadable authentication response");
	const token = (value as Record<string, unknown>).access_token;
	if (typeof token !== "string" || token.length < 8 || token.length > 100_000) throw new Error("Databricks CLI did not return an access token");
	return token;
}

export async function resolveDatabricksAuth(
	environment: NodeJS.ProcessEnv = process.env,
	run: AuthCommand = defaultAuthCommand,
): Promise<DatabricksAuth> {
	if (!environment.DATABRICKS_HOST) throw new Error("DATABRICKS_HOST is required for Databricks access");
	const host = workspaceUrl(environment.DATABRICKS_HOST);
	if (environment.DATABRICKS_TOKEN) {
		if (environment.DATABRICKS_TOKEN.length < 8 || environment.DATABRICKS_TOKEN.length > 100_000) throw new Error("DATABRICKS_TOKEN is malformed");
		return { host, token: environment.DATABRICKS_TOKEN, source: "environment" };
	}
	const response = await run("databricks", ["auth", "token", "--host", host.origin]);
	return { host, token: parseCliToken(response.stdout), source: "databricks-cli" };
}
