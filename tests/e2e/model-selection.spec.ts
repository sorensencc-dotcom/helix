import { test, expect } from "@playwright/test";
import {
  startTestDaemon,
  type TestDaemonHandle,
} from "../support/test-daemon-server.js";

test.describe("Helix Browser E2E: Model Selection & Invariant Defense", () => {
  let daemon: TestDaemonHandle;

  test.beforeAll(async () => {
    daemon = await startTestDaemon();
  });

  test.afterAll(async () => {
    if (daemon) {
      await daemon.close();
    }
  });

  test.beforeEach(async () => {
    await fetch(`${daemon.baseUrl}/__fixture/reset`, { method: "POST" });
  });

  test("Scenario 1: UI model selection dropdown renders available local and cloud options", async ({
    page,
  }) => {
    await page.goto(daemon.baseUrl);

    const modelSelect = page.locator("#model-select");
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue("automatic");

    const options = modelSelect.locator("option");
    await expect(options).toHaveCount(5);

    const optionValues = await options.evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    expect(optionValues).toEqual([
      "automatic",
      "claude-3-5-sonnet-20241022",
      "gemini-2.0-flash",
      "gpt-4o",
      "grok-2",
    ]);
  });

  test("Scenario 2: Prompt retention on session creation failure", async ({
    page,
  }) => {
    await fetch(`${daemon.baseUrl}/__fixture/faults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ failSession: true }),
    });

    await page.goto(daemon.baseUrl);

    const promptInput = page.locator("#prompt");
    const testPrompt = "Confidential user instruction during session failure";
    await promptInput.fill(testPrompt);

    await page.locator('#ask-form button[type="submit"]').click();

    // Verify error notification
    const notice = page.locator("#notice");
    await expect(notice).toContainText("Request failed");

    // INVARIANT CHECK: Prompt is preserved in composer input
    await expect(promptInput).toHaveValue(testPrompt);
  });

  test("Scenario 3: Prompt retention on local failure and ZERO automatic cloud dispatches", async ({
    page,
  }) => {
    await fetch(`${daemon.baseUrl}/__fixture/faults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ failLocal: true }),
    });

    await page.goto(daemon.baseUrl);

    const promptInput = page.locator("#prompt");
    const testPrompt =
      "Prompt for local execution with injected daemon failure";
    await promptInput.fill(testPrompt);

    await page.locator('#ask-form button[type="submit"]').click();

    // Verify error message rendered in thread
    const thread = page.locator("#thread");
    await expect(thread).toContainText("Request unavailable");

    // INVARIANT CHECK 1: Prompt is preserved in composer input
    await expect(promptInput).toHaveValue(testPrompt);

    // INVARIANT CHECK 2: Zero automatic dispatches to cloud providers
    const countersRes = await fetch(`${daemon.baseUrl}/__fixture/counters`);
    const { dispatches } = (await countersRes.json()) as {
      dispatches: {
        local: number;
        claude: number;
        antigravity: number;
        codex: number;
        grok: number;
      };
    };

    expect(dispatches.local).toBe(1);
    expect(dispatches.claude).toBe(0);
    expect(dispatches.antigravity).toBe(0);
    expect(dispatches.codex).toBe(0);
    expect(dispatches.grok).toBe(0);
  });

  test("Scenario 4: Explicit operator model selection and user resubmit behavior", async ({
    page,
  }) => {
    // 1. Initial attempt fails locally
    await fetch(`${daemon.baseUrl}/__fixture/faults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ failLocal: true }),
    });

    await page.goto(daemon.baseUrl);

    const promptInput = page.locator("#prompt");
    const testPrompt = "Crucial query requiring explicit model resubmission";
    await promptInput.fill(testPrompt);
    await page.locator('#ask-form button[type="submit"]').click();

    await expect(promptInput).toHaveValue(testPrompt);

    // 2. Operator actively changes dropdown to Claude
    const modelSelect = page.locator("#model-select");
    await modelSelect.selectOption("claude-3-5-sonnet-20241022");

    // 3. Operator explicitly clicks Send to resubmit
    await page.locator('#ask-form button[type="submit"]').click();

    // Verify prompt cleared on success
    await expect(promptInput).toHaveValue("");

    // Verify response rendered in thread
    const thread = page.locator("#thread");
    await expect(thread).toContainText("[Claude Frontier Response]");

    // INVARIANT CHECK: Exactly one dispatch to Claude, zero to other cloud providers
    const countersRes = await fetch(`${daemon.baseUrl}/__fixture/counters`);
    const { dispatches } = (await countersRes.json()) as {
      dispatches: {
        local: number;
        claude: number;
        antigravity: number;
        codex: number;
        grok: number;
      };
    };

    expect(dispatches.local).toBe(1);
    expect(dispatches.claude).toBe(1);
    expect(dispatches.antigravity).toBe(0);
    expect(dispatches.codex).toBe(0);
    expect(dispatches.grok).toBe(0);
  });
});
