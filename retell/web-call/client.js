const startButton = document.querySelector("#start-call");
const muteButton = document.querySelector("#mute-call");
const endButton = document.querySelector("#end-call");
const statusText = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const callReference = document.querySelector("#call-reference");

const webClient = new window.retellClientJsSdk.RetellWebClient();
let isMuted = false;

function setStatus(message, state = "idle") {
  statusText.textContent = message;
  statusDot.dataset.state = state;
}

function setCallControls(active) {
  startButton.disabled = active;
  muteButton.disabled = !active;
  endButton.disabled = !active;
}

function endCall() {
  webClient.stopCall();
  setCallControls(false);
  setStatus("Call ended", "idle");
  muteButton.textContent = "Mute";
  isMuted = false;
}

webClient.on("call_started", () => {
  setStatus("Connected — you can speak", "connected");
  setCallControls(true);
});

webClient.on("call_ready", () => {
  setStatus("Agent audio is ready", "connected");
});

webClient.on("agent_start_talking", () => {
  setStatus("Agent is speaking", "speaking");
});

webClient.on("agent_stop_talking", () => {
  setStatus("Listening", "connected");
});

webClient.on("call_ended", () => {
  setCallControls(false);
  setStatus("Call ended", "idle");
});

webClient.on("error", () => {
  setCallControls(false);
  setStatus("The voice test could not start", "error");
});

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  setStatus("Creating a private test session…", "connecting");
  callReference.textContent = "";

  try {
    const response = await fetch("/api/web-call", { method: "POST" });
    const body = await response.json();

    if (!response.ok || !body.access_token) {
      throw new Error("Web-call registration failed.");
    }

    callReference.textContent = `Call reference: ${body.call_id}`;
    await webClient.startCall({ accessToken: body.access_token });
    await webClient.startAudioPlayback();
  } catch (error) {
    console.error(error);
    setCallControls(false);
    setStatus("The voice test could not start", "error");
  }
});

muteButton.addEventListener("click", () => {
  if (isMuted) {
    webClient.unmute();
    muteButton.textContent = "Mute";
    setStatus("Listening", "connected");
  } else {
    webClient.mute();
    muteButton.textContent = "Unmute";
    setStatus("Microphone muted", "idle");
  }

  isMuted = !isMuted;
});

endButton.addEventListener("click", endCall);
window.addEventListener("beforeunload", () => webClient.stopCall());

window.webCallTesterReady = true;
