import * as logger from "firebase-functions/logger";

const GCP_PROJECT = "tingutales0";
const GCP_REGION = "asia-south1";

/**
 * Builds a Google Cloud Logs Explorer URL that filters to a specific Cloud Run service
 * (Firebase Functions v2 runs on Cloud Run) in the asia-south1 region.
 * The service name in Cloud Run matches the function name lowercased with hyphens.
 * @param {string} functionName - The camelCase function name (sub-labels after ":" are stripped).
 * @return {string} A fully-encoded Cloud Logs Explorer URL.
 */
function logsUrl(functionName: string): string {
  // Strip sub-labels like "processPageImage:enqueuePdf" → "processPageImage"
  const baseName = functionName.split(":")[0];
  // Cloud Run service names are lowercased with hyphens (camelCase → kebab-case)
  const serviceName = baseName.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, "");
  const query = [
    "resource.type=\"cloud_run_revision\"",
    `resource.labels.service_name="${serviceName}"`,
    `resource.labels.location="${GCP_REGION}"`,
    "severity>=ERROR",
  ].join("\n");
  const encoded = encodeURIComponent(query);
  return `https://console.cloud.google.com/logs/query;query=${encoded}?project=${GCP_PROJECT}`;
}

/**
 * Sends an error notification to Slack via the configured webhook URL.
 * Fires and forgets — never throws so it never interrupts function logic.
 * @param {string} functionName - The name of the function where the error occurred.
 * @param {unknown} err - The error that was caught.
 * @param {Record<string, string>} [context] - Optional key/value pairs (e.g. storyId, userId).
 */
export function notifySlackError(
  functionName: string,
  err: unknown,
  context?: Record<string, string>
): void {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ?
    `\n${err.stack.split("\n").slice(1, 5).join("\n")}` :
    "";

  const contextLines = context ?
    "\n" + Object.entries(context).map(([k, v]) => `• *${k}:* ${v}`).join("\n") :
    "";

  const url = logsUrl(functionName);

  const text =
    `:red_circle: *${functionName}* error\n\`\`\`${message}${stack}\`\`\`${contextLines}\n<${url}|View logs →>`;

  fetch(webhookUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({text}),
  }).catch((fetchErr: unknown) => {
    logger.warn("[slack] failed to send error notification", fetchErr);
  });
}
