---
name: backend-development
description: Implement APIs, services, and scheduled application jobs using existing framework, persistence, and deployment conventions.
---

# Backend development

- Follow the repository's framework and architecture, whether FastAPI, Django, Flask, Node, Go, or another stack. Identify public contracts and compatibility commitments before changing handlers.
- Validate inputs at boundaries. Make errors stable and useful without leaking internals. Keep business rules out of transport and persistence adapters where practical.
- Make configuration explicit and secrets external. Use dependency injection when it materially improves testability or lifecycle management, not as ceremony.
- Account for transactions, concurrency, idempotency, and retry effects around writes and scheduled jobs. Plan database migrations and backward compatibility with deployed versions.
- Add focused tests for logic and integration tests for persistence, auth boundaries, external calls, and framework wiring. Use the project's logging conventions and avoid sensitive values.
