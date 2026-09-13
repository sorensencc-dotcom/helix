import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("browser operator console boundary", () => {
  it("discloses fixture mode and does not claim live authority", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain("LOCAL FIXTURE MODE");
    expect(html).toContain('id="icf-readiness">● Unavailable');
    expect(html).toContain('id="sigil-readiness">● Unavailable');
    expect(html).not.toContain('ICF <span class="connected">');
    expect(html).not.toContain('Sigil <span class="connected">');
  });

  it("uses canonical task retrieval and cancellation routes", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain("/v1/tasks/${encodeURIComponent(task.id)}");
    expect(html).toContain("/v1/tasks/${encodeURIComponent(id)}/cancel");
    expect(html).toContain("fetch('/v1/stream?follow=1'");
    expect(html).toContain('id="session-list"');
    expect(html).toContain(
      "button.setAttribute('aria-label', `Cancel task ${task.id}`)",
    );
  });

  it("validates every JSON boundary before rendering server values", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain("function isRecord(value)");
    expect(html).toContain("function validateStatus(value)");
    expect(html).toContain("function isReadiness(value, extraKey)");
    expect(html).toContain("function validateSessions(value)");
    expect(html).toContain("function validateTask(value)");
    expect(html).toContain("function validateHistory(value)");
    expect(html).toContain("validateTask(payload.task)");
    expect(html).not.toContain("innerHTML");
    expect(html).toContain("bubble.textContent = text");
    expect(html).toContain("detail.textContent = disclosure");
    expect(html).toContain("hasOwnProperty.call(task, 'response')");
    expect(html).toContain("renderReadiness(result.readiness)");
    expect(html).toContain("function renderResponseDetails(item, task)");
    expect(html).toContain("Response disclosure");
    expect(html).toContain("response?.modelUsed");
    expect(html).toContain("metadata?.approvalState");
    expect(html).toContain("metadata?.receiptState");
    expect(html).toContain("response?.responseDisclosure");
    expect(html).toContain("response?.effectiveScope");
    expect(html).toContain("response?.modelDecision");
    expect(html).toContain("Response disclosure");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("button:focus-visible");
  });

  it("keeps fixture and read-only claims explicit", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain("LOCAL FIXTURE MODE");
    expect(html).toContain("no scope-edit route is available");
    expect(html).toContain(
      "No live authority or production control is available",
    );
    expect(html).toContain("response metadata is disclosed below.");
  });

  it("exposes accessible model selection dropdown and fail-safe prompt retention", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain('id="model-select"');
    expect(html).toContain('aria-label="Select model"');
    expect(html).toContain('value="automatic"');
    expect(html).toContain('value="claude-3-5-sonnet-20241022"');
    expect(html).toContain('value="gemini-2.0-flash"');
    expect(html).toContain('value="gpt-4o"');
    expect(html).toContain('value="grok-2"');
    expect(html).toContain("prompt retained for resubmission");
  });
});
