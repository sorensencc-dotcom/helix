// Local dev stub only. Implements the helix-adapter.v1 contract shapes from
// src/adapters/contracts.ts so Helix can be wired to a real HTTP transport
// during local docker development. Not a real ICF/WhichLLM/Sigil authority.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4180);
const CONTRACT = "helix-adapter.v1";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    send(response, 405, {
      status: "failure",
      code: "UNAVAILABLE",
      message: "Stub only accepts POST.",
    });
    return;
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    send(response, 400, {
      status: "failure",
      code: "MALFORMED_RESPONSE",
      message: "Stub could not parse request body.",
    });
    return;
  }

  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/icf/resolve") {
    send(response, 200, {
      contract: CONTRACT,
      status: "success",
      sources: ["stub:local-dev/authority-stub"],
      governed: Boolean(body.governed),
      lineageId: "lin_local_dev_stub",
    });
    return;
  }

  if (url.pathname === "/whichllm/route") {
    send(response, 200, {
      contract: CONTRACT,
      status: "success",
      provider: "local-dev-stub",
      model: "local-dev-stub-model",
      cloudEnabled: false,
    });
    return;
  }

  if (url.pathname === "/sigil/execute") {
    send(response, 200, {
      contract: CONTRACT,
      status: "success",
      proposalId: "proposal_local-dev-stub",
      state: "APPROVAL_REQUIRED",
    });
    return;
  }

  send(response, 404, {
    status: "failure",
    code: "UNAVAILABLE",
    message: `Stub has no route for ${url.pathname}.`,
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[authority-stub] LOCAL DEV STUB listening on :${PORT}`);
});
