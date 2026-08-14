const startButton = document.querySelector("#start-call");
const endButton = document.querySelector("#end-call");
const statusText = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const callReference = document.querySelector("#call-reference");
const eventLog = document.querySelector("#event-log");
const fixtureControls = document.querySelector("#fixture-controls");
const fixtureButtons = document.querySelector("#fixture-buttons");

const scenarioId = new URLSearchParams(window.location.search).get("scenario");
const audioContext = new AudioContext();
const microphoneDestination = audioContext.createMediaStreamDestination();
const webClient = new window.retellClientJsSdk.RetellWebClient();

const scenarioFixtures = {
  "new-project": [
    "name",
    "route",
    "request",
    "callback-yes",
    "phone",
    "email",
    "topic",
    "date-time",
    "confirm",
    "no-more",
  ],
  "existing-order-support": [
    "name",
    "route",
    "different-phone",
    "phone-confirm",
    "order-confirm-broken",
    "broken",
    "best-phone",
    "email",
    "email-confirm",
    "second-question",
    "no-more",
  ],
  "existing-order-shipment": [
    "name",
    "route",
    "email-offer",
    "email",
    "email-confirm",
    "order-confirm-tracking",
    "tracking",
    "decline-email",
    "carrier",
    "no-more",
  ],
};

const state = {
  callId: null,
  callEnded: false,
  agentTalking: false,
  events: [],
  updates: [],
};

function setStatus(message, status = "idle") {
  statusText.textContent = message;
  statusDot.dataset.state = status;
}

function recordEvent(type, data = null) {
  const event = { type, data, recordedAt: new Date().toISOString() };
  state.events.push(event);

  if (type === "update" || type === "call_ended" || type === "error") {
    eventLog.textContent = JSON.stringify(event, null, 2);
  }
}

async function useGeneratedMicrophone() {
  await audioContext.resume();

  navigator.mediaDevices.getUserMedia = async () =>
    microphoneDestination.stream;
}

async function playFixture(fileName) {
  if (!scenarioId) {
    throw new Error("A scenario query parameter is required.");
  }

  const response = await fetch(
    `/voice-fixtures/${encodeURIComponent(scenarioId)}/${encodeURIComponent(fileName)}.wav`,
  );

  if (!response.ok) {
    throw new Error(`Fixture ${fileName} was not found.`);
  }

  const encodedAudio = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(encodedAudio);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(microphoneDestination);

  recordEvent("fixture_started", { fileName });

  await new Promise((resolve) => {
    source.addEventListener("ended", resolve, { once: true });
    source.start();
  });

  recordEvent("fixture_ended", { fileName });
}

function renderFixtureButtons() {
  const files = scenarioFixtures[scenarioId] ?? [];

  fixtureButtons.replaceChildren();

  for (const fileName of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = fileName;
    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        await playFixture(fileName);
      } finally {
        button.disabled = false;
      }
    });
    fixtureButtons.append(button);
  }

  fixtureControls.hidden = files.length === 0;
}

async function startCall() {
  if (!scenarioId) {
    throw new Error("Open this page with a valid scenario query parameter.");
  }

  startButton.disabled = true;
  setStatus("Creating call…", "connecting");
  await useGeneratedMicrophone();

  const response = await fetch("/api/web-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  const body = await response.json();

  if (!response.ok || !body.access_token) {
    throw new Error("Web-call registration failed.");
  }

  state.callId = body.call_id;
  callReference.textContent = `Call reference: ${body.call_id}`;
  await webClient.startCall({ accessToken: body.access_token });
  await webClient.startAudioPlayback();
}

function endCall() {
  webClient.stopCall();
}

webClient.on("call_started", () => {
  setStatus("Connected", "connected");
  endButton.disabled = false;
  recordEvent("call_started");
});

webClient.on("call_ready", () => {
  recordEvent("call_ready");
});

webClient.on("agent_start_talking", () => {
  state.agentTalking = true;
  setStatus("Agent speaking", "speaking");
  recordEvent("agent_start_talking");
});

webClient.on("agent_stop_talking", () => {
  state.agentTalking = false;
  setStatus("Ready for fixture", "connected");
  recordEvent("agent_stop_talking");
});

webClient.on("update", (update) => {
  state.updates.push(update);
  recordEvent("update", update);
});

webClient.on("node_transition", (transition) => {
  recordEvent("node_transition", transition);
});

webClient.on("call_ended", () => {
  state.callEnded = true;
  startButton.disabled = true;
  endButton.disabled = true;
  setStatus("Call ended", "idle");
  recordEvent("call_ended");
});

webClient.on("error", (error) => {
  setStatus("Call failed", "error");
  recordEvent("error", error);
});

startButton.addEventListener("click", () => {
  startCall().catch((error) => {
    console.error(error);
    setStatus("Call failed", "error");
    recordEvent("error", { message: error.message });
  });
});

endButton.addEventListener("click", endCall);
window.addEventListener("beforeunload", endCall);

window.voiceQa = {
  endCall,
  playFixture,
  state,
  startCall,
};
window.voiceQaReady = true;
renderFixtureButtons();
