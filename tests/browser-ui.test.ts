import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("browser operator console boundary", () => {
  it("discloses fixture mode and does not claim live authority", async () => {
    const html = await readFile(
      new URL("../web/index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain("LOCAL FIXTURE MODE");
    expect(html).toContain("ICF <span>● Unavailable");
    expect(html).toContain("Sigil <span>● Unavailable");
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
    expect(html).toContain("new EventSource('/v1/stream?follow=1')");
    expect(html).toContain('id="session-list"');
    expect(html).toContain('aria-label="Cancel task ${task.id}"');
  });
});
