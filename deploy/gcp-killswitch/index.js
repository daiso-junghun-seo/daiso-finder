// deploy/gcp-killswitch/index.js
//
// Budget kill switch for daiso-finder-prod. Cloud Billing publishes a budget notification to Pub/Sub
// when spend crosses a threshold; this function unlinks the billing account from the project at 100%
// so no further charges can accrue. Nothing is deleted: the VM stops and stays stopped until someone
// re-links billing on purpose (gcloud billing projects link ...).
//
// Why not a spend cap budget? Cloud Billing spend caps do not cover Compute Engine (2026-11).
//
// Trust boundary: the payload is data, not instructions. Only a message whose budgetDisplayName
// matches this deployment AND whose alertThresholdExceeded reaches KILL_THRESHOLD can unlink billing,
// so a 50% alert (or another budget's alert) never shuts the app down.
//
// No dependencies: the metadata server hands out an access token and Node ships fetch.
// No "type": "module", so this file stays CommonJS and gen2 loads it with require().

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const BUDGET_DISPLAY_NAME = process.env.BUDGET_DISPLAY_NAME || '';
const KILL_THRESHOLD = Number(process.env.KILL_THRESHOLD || '1');

async function accessToken() {
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`metadata token request failed: ${res.status}`);
  const body = await res.json();
  return body.access_token;
}

// PUT with an empty billingAccountName is the documented "disable billing" call. It is idempotent:
// on a project that is already unlinked it succeeds and changes nothing.
async function unlinkBilling(token) {
  const res = await fetch(
    `https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ billingAccountName: '' }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`billingInfo update failed: ${res.status} ${text}`);
  }
  return res.json();
}

exports.killSwitch = async (message) => {
  let payload;
  try {
    payload = JSON.parse(
      message?.data ? Buffer.from(message.data, 'base64').toString('utf8') : '{}',
    );
  } catch {
    console.error('kill switch: message is not JSON — no action');
    return;
  }

  const name = payload.budgetDisplayName ?? '';
  const threshold = Number(payload.alertThresholdExceeded ?? 0);
  console.log(
    `kill switch: budget="${name}" threshold=${threshold} cost=${payload.costAmount} ${payload.currencyCode ?? ''}`,
  );

  if (!BUDGET_DISPLAY_NAME || name !== BUDGET_DISPLAY_NAME) {
    console.log('kill switch: not this budget — no action');
    return;
  }
  if (!(threshold >= KILL_THRESHOLD)) {
    console.log('kill switch: below the kill threshold — no action');
    return;
  }
  if (!PROJECT_ID) {
    throw new Error('kill switch: PROJECT_ID is not set');
  }

  const token = await accessToken();
  const info = await unlinkBilling(token);
  console.log(
    `kill switch: billing unlinked from ${PROJECT_ID} (billingEnabled=${info.billingEnabled})`,
  );
};
