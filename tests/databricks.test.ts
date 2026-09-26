import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { parsePolicy } from "../src/policy.ts";
import { resolveDatabricksAuth } from "../extensions/databricks/auth.ts";
import { DatabricksClient } from "../extensions/databricks/client.ts";
import { normalizeLineage, normalizeTable } from "../extensions/databricks/normalize.ts";
import { profileTable } from "../extensions/databricks/profiling.ts";
import { assertGeneratedSelect, profileQuery } from "../extensions/databricks/sql.ts";

const policySource = `project:
  type: internal
databricks:
  enabled: true
  allowed_catalogs: [research]
  allowed_schemas: [research.safe]
  warehouse: warehouse-123
  approved_tables:
    research.safe.events: [score, event_date]
  minimum_cohort_size: 10
`;

function json(res: ServerResponse, body: unknown, status = 200): void {
	const source = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(source) });
	res.end(source);
}

async function requestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.from(chunk));
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function mockServer(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): Promise<{ base: URL; close: () => Promise<void> }> {
	const server = createServer((req, res) => void Promise.resolve(handler(req, res)).catch(() => json(res, {}, 500)));
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Mock server did not bind");
	return { base: new URL(`http://127.0.0.1:${address.port}`), close: async () => { server.close(); await once(server, "close"); } };
}

function sqlResponse(columns: string[], row: Array<string | null>): unknown {
	return {
		status: { state: "SUCCEEDED" },
		manifest: { schema: { columns: columns.map(name => ({ name, type_name: "STRING" })) }, truncated: false },
		result: { data_array: [row] },
	};
}

test("Databricks auth uses a shell-free U2M CLI fallback", async () => {
	let invocation: { file: string; args: string[] } | undefined;
	const auth = await resolveDatabricksAuth(
		{ DATABRICKS_HOST: "https://workspace.example.com" },
		async (file, args) => {
			invocation = { file, args };
			return { stdout: JSON.stringify({ access_token: "short-lived-token" }) };
		},
	);
	assert.deepEqual(invocation, { file: "databricks", args: ["auth", "token", "--host", "https://workspace.example.com"] });
	assert.equal(auth.source, "databricks-cli");
	assert.equal(auth.token, "short-lived-token");
});

test("table response normalization redacts credential-like properties", () => {
	const table = normalizeTable({
		full_name: "research.safe.events",
		name: "events",
		catalog_name: "research",
		schema_name: "safe",
		columns: [{ name: "score", type_text: "DOUBLE", type_name: "DOUBLE", nullable: true }],
		properties: { quality: "silver", api_token: "must-not-leak", passwordHint: "must-not-leak" },
	});
	assert.equal(table.properties?.quality, undefined);
	assert.equal(table.properties?.api_token, "[redacted]");
	assert.equal(table.properties?.passwordHint, "[redacted]");
});

test("generated SQL classifier rejects mutation and profile SQL contains no user statement", () => {
	for (const statement of ["DELETE FROM research.safe.events", "SELECT 1; DROP TABLE x", "CREATE TABLE x(a INT)", "COPY INTO x FROM y"]) {
		assert.throws(() => assertGeneratedSelect(statement), /SELECT|forbidden|validation/);
	}
	const statement = profileQuery("research.safe.events", [{ name: "score", type: "DOUBLE", typeName: "DOUBLE" }]);
	assert.doesNotThrow(() => assertGeneratedSelect(statement));
	assert.match(statement, /COUNT\(DISTINCT `score`\)/);
	assert.doesNotMatch(statement, /SELECT \*/);
	assert.doesNotMatch(statement, /GROUP BY|ORDER BY|TOP\s/i);
	assert.throws(() => profileQuery("research.safe.events", [{ name: "score`; DROP TABLE x", type: "DOUBLE" }]), /Unsupported identifier/);
});

test("direct Databricks clients enforce disabled metadata policy before requests", async () => {
	let requests = 0;
	const server = await mockServer((_req, res) => { requests += 1; json(res, { catalogs: [] }); });
	try {
		const disabled = parsePolicy(policySource.replace("enabled: true", "enabled: false"));
		await assert.rejects(new DatabricksClient(server.base, "test-token").listCatalogs(disabled), /metadata access is disabled/);
		assert.equal(requests, 0);
	} finally { await server.close(); }
});

test("lineage normalization omits tables outside configured scope", () => {
	const policy = parsePolicy(policySource);
	const allowed = (table: string) => {
		const [catalog, schema] = table.split(".");
		return policy.databricks.allowed_catalogs.includes(catalog ?? "") && policy.databricks.allowed_schemas.includes(`${catalog}.${schema}`);
	};
	const lineage = normalizeLineage({
		columns: ["direction", "table_name"],
		rows: [{ direction: "upstream", table_name: "research.safe.source" }, { direction: "upstream", table_name: "secret.hr.people" }, { direction: "downstream", table_name: "research.safe.model_data" }],
	}, "research.safe.events", allowed);
	assert.deepEqual(lineage.upstreamTables, ["research.safe.source"]);
	assert.deepEqual(lineage.downstreamTables, ["research.safe.model_data"]);
	assert.equal(lineage.omittedOutsideScope, 1);
	assert.doesNotMatch(JSON.stringify(lineage), /secret\.hr\.people/);
});

test("aggregate profiling uses tags first, returns summaries, and never requests raw rows", async () => {
	const seenStatements: string[] = [];
	const server = await mockServer(async (req, res) => {
		assert.equal(req.headers.authorization, "Bearer test-token");
		if (req.method === "GET" && req.url?.startsWith("/api/2.1/unity-catalog/tables/")) {
			json(res, {
				name: "events", full_name: "research.safe.events", catalog_name: "research", schema_name: "safe",
				columns: [
					{ name: "score", type_text: "DOUBLE", type_name: "DOUBLE", nullable: true },
					{ name: "event_date", type_text: "DATE", type_name: "DATE", nullable: false },
				],
			});
			return;
		}
		assert.equal(req.method, "POST");
		assert.equal(req.url, "/api/2.0/sql/statements");
		const body = await requestBody(req);
		const statement = String(body.statement);
		seenStatements.push(statement);
		assert.equal(body.disposition, "INLINE");
		if (statement.includes("information_schema.table_tags")) {
			json(res, sqlResponse(["object_type", "column_name", "tag_name", "tag_value"], ["table", null, "classification", "public"]));
		} else if (statement === "SELECT COUNT(*) AS row_count FROM `research`.`safe`.`events`") {
			json(res, sqlResponse(["row_count"], ["100"]));
		} else {
			json(res, sqlResponse([
				"row_count", "c0_null_count", "c0_cardinality", "c0_minimum", "c0_maximum", "c0_mean", "c0_standard_deviation", "c0_q25", "c0_median", "c0_q75", "duplicate_rows",
			], ["100", "4", "81", "0.1", "0.9", "0.5", "0.2", "0.3", "0.5", "0.7", "2"]));
		}
	});
	try {
		const profile = await profileTable(new DatabricksClient(server.base, "test-token"), parsePolicy(policySource), "research.safe.events", ["score"]);
		assert.equal(profile.cohort.suppressed, false);
		assert.equal(profile.columns[0]?.nullProportion, 0.04);
		assert.equal(profile.columns[0]?.median, "0.5");
		assert.equal(seenStatements.length, 3);
		assert.ok(seenStatements.every(statement => /^SELECT/.test(statement)));
		assert.ok(seenStatements.every(statement => !/SELECT\s+\*/i.test(statement)));
	} finally { await server.close(); }
});

test("small cohorts are suppressed before value aggregates run", async () => {
	let posts = 0;
	const server = await mockServer(async (req, res) => {
		if (req.method === "GET") {
			json(res, { name: "events", full_name: "research.safe.events", catalog_name: "research", schema_name: "safe", columns: [{ name: "score", type_text: "DOUBLE", type_name: "DOUBLE" }] });
			return;
		}
		posts += 1;
		const statement = String((await requestBody(req)).statement);
		if (statement.includes("information_schema.table_tags")) json(res, sqlResponse(["object_type", "column_name", "tag_name", "tag_value"], ["table", null, "classification", "public"]));
		else json(res, sqlResponse(["row_count"], ["3"]));
	});
	try {
		const profile = await profileTable(new DatabricksClient(server.base, "test-token"), parsePolicy(policySource), "research.safe.events", ["score"]);
		assert.deepEqual(profile.columns, []);
		assert.deepEqual(profile.cohort, { suppressed: true, minimumSize: 10 });
		assert.equal(posts, 2);
	} finally { await server.close(); }
});

test("sensitive tags stop profiling before any value-derived aggregate", async () => {
	const statements: string[] = [];
	const server = await mockServer(async (req, res) => {
		if (req.method === "GET") {
			json(res, {
				name: "events", full_name: "research.safe.events", catalog_name: "research", schema_name: "safe",
				columns: [{ name: "score", type_text: "DOUBLE", type_name: "DOUBLE" }],
			});
			return;
		}
		const statement = String((await requestBody(req)).statement);
		statements.push(statement);
		json(res, sqlResponse(
			["object_type", "column_name", "tag_name", "tag_value"],
			["column", "score", "classification", "restricted"],
		));
	});
	try {
		await assert.rejects(
			profileTable(new DatabricksClient(server.base, "test-token"), parsePolicy(policySource), "research.safe.events", ["score"]),
			/Sensitive classification blocks value profiling/,
		);
		assert.equal(statements.length, 1);
		assert.match(statements[0]!, /information_schema\.table_tags/);
		assert.doesNotMatch(statements[0]!, /COUNT\(\*\) AS row_count/);
	} finally { await server.close(); }
});

test("missing visible tags fail closed before row counts", async () => {
	let posts = 0;
	const server = await mockServer(async (req, res) => {
		if (req.method === "GET") {
			json(res, {
				name: "events", full_name: "research.safe.events", catalog_name: "research", schema_name: "safe",
				columns: [{ name: "score", type_text: "DOUBLE", type_name: "DOUBLE" }],
			});
			return;
		}
		posts += 1;
		await requestBody(req);
		json(res, {
			status: { state: "SUCCEEDED" },
			manifest: { schema: { columns: ["object_type", "column_name", "tag_name", "tag_value"].map(name => ({ name, type_name: "STRING" })) }, truncated: false },
			result: { data_array: [] },
		});
	});
	try {
		await assert.rejects(
			profileTable(new DatabricksClient(server.base, "test-token"), parsePolicy(policySource), "research.safe.events", ["score"]),
			/missing tags do not establish safety/,
		);
		assert.equal(posts, 1);
	} finally { await server.close(); }
});

test("Databricks failures do not reveal credentials or remote error bodies", async () => {
	const server = await mockServer((_req, res) => { res.writeHead(401); res.end("test-token confidential-body"); });
	try {
		const client = new DatabricksClient(server.base, "test-token");
		await assert.rejects(client.listCatalogs(parsePolicy(policySource)), error => {
			const message = String(error);
			return message.includes("401") && !message.includes("test-token") && !message.includes("confidential-body");
		});
	} finally { await server.close(); }
});

test("lineage uses documented system table SELECT and never releases outside-scope names", async () => {
	const server = await mockServer(async (req,res) => {
		assert.equal(req.method,"POST");
		assert.equal(req.url,"/api/2.0/sql/statements");
		const request = await requestBody(req);
		assert.match(String(request.statement), /FROM system\.access\.table_lineage/);
		assert.match(String(request.statement), /target_table_full_name = 'research.safe.events'/);
		assert.doesNotMatch(String(request.statement), /source_path|created_by|entity_id/);
		json(res,{status:{state:"SUCCEEDED"},manifest:{schema:{columns:[{name:"direction"},{name:"table_name"}]},truncated:false},result:{data_array:[["upstream","research.safe.source"],["downstream","private.people.identities"]]}});
	});
	try {
		const lineage = await new DatabricksClient(server.base,"test-token").getLineage(parsePolicy(policySource),"research.safe.events");
		assert.deepEqual(lineage.upstreamTables,["research.safe.source"]);
		assert.equal(lineage.omittedOutsideScope,1);
		assert.doesNotMatch(JSON.stringify(lineage),/private.people/);
		assert.match(lineage.coverage,/incomplete/);
	} finally { await server.close(); }
});
