const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_UNAUTHENTICATED_RECONNECTS = 10;
const AUTHENTICATION_ACK_TIMEOUT_MS = 10000;

let socket = null;
let socketAuthenticated = false;
let config = null;
let connectPromise = null;
let reconnectTimer = null;
let consecutiveUnauthenticatedFailures = 0;
let stopped = false;
let stoppedToken = null;

async function loadConfig() {
  const bootstrapped = self.__tildeTrustedRuntimeBootstrap?.config;
  if (bootstrapped?.runtimeToken) {
    config = bootstrapped;
    if (stopped && stoppedToken !== bootstrapped.runtimeToken) {
      stopped = false;
      stoppedToken = null;
      consecutiveUnauthenticatedFailures = 0;
    }
    return config;
  }
  if (config?.runtimeToken) return config;
  const stored = await chrome.storage.local.get("tildeTrustedRuntimeBootstrap");
  config = Object.assign({}, stored.tildeTrustedRuntimeBootstrap?.config ?? {}, config ?? {});
  return config;
}

async function sendToRuntimeTab(command) {
  const tabs = await chrome.tabs.query({});
  const runtimeTabs = tabs
    .filter((tab) => tab?.url?.startsWith("http://") || tab?.url?.startsWith("https://"))
    .concat(tabs.filter((tab) => !(tab?.url?.startsWith("http://") || tab?.url?.startsWith("https://"))));
  for (const tab of runtimeTabs) {
    if (!tab?.id) continue;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, command);
      if (response !== undefined) return response;
    } catch (_error) {
      // Try the next tab; not every Browserbase tab has our content script.
    }
  }
  return { error: "no_runtime_content_script_tab" };
}

function wsUrlFromConfig(cfg) {
  const base = new URL(cfg.apiBaseUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/api/v1/org/${encodeURIComponent(cfg.orgId)}/team/${encodeURIComponent(cfg.teamId)}/browser-session/${encodeURIComponent(cfg.sessionId)}/plugin-events`;
  base.search = "";
  return base.toString();
}

function sendOnSocket(runtimeSocket, message) {
  if (runtimeSocket.readyState === WebSocket.OPEN) {
    runtimeSocket.send(JSON.stringify(message));
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function retryDelayMs() {
  const exponent = Math.min(consecutiveUnauthenticatedFailures, 4);
  const base = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * Math.pow(2, exponent)
  );
  return base + Math.floor(Math.random() * 500);
}

function stopRuntimeReconnects(reason) {
  stopped = true;
  stoppedToken = config?.runtimeToken ?? stoppedToken;
  clearReconnectTimer();
  if (config) delete config.runtimeToken;
  if (self.__tildeTrustedRuntimeBootstrap?.config) {
    delete self.__tildeTrustedRuntimeBootstrap.config.runtimeToken;
  }
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    try {
      socket.close();
    } catch (_error) {
      // The runtime is already stopping; close failures are diagnostic only.
    }
  }
  self.__tildeTrustedRuntimeStopped = {
    reason,
    at: Date.now(),
    consecutiveUnauthenticatedFailures
  };
}

function recordUnauthenticatedFailure(reason) {
  consecutiveUnauthenticatedFailures += 1;
  self.__tildeTrustedRuntimeReconnectState = {
    reason,
    stopped,
    consecutiveUnauthenticatedFailures,
    maxUnauthenticatedReconnects: MAX_UNAUTHENTICATED_RECONNECTS,
    at: Date.now()
  };
  if (consecutiveUnauthenticatedFailures >= MAX_UNAUTHENTICATED_RECONNECTS) {
    stopRuntimeReconnects("max_unauthenticated_reconnects");
  }
}

function scheduleReconnect(reason) {
  if (stopped || reconnectTimer || socket?.readyState === WebSocket.OPEN) return;
  if (!config?.runtimeToken) return;
  const delay = retryDelayMs();
  self.__tildeTrustedRuntimeReconnectState = {
    reason,
    stopped,
    consecutiveUnauthenticatedFailures,
    nextRetryDelayMs: delay,
    at: Date.now()
  };
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function connect() {
  const cfg = await loadConfig();
  if (stopped) return { connected: false, stopped: true };
  if (!cfg?.runtimeToken) return { connected: false, error: "missing_runtime_token" };
  if (socket?.readyState === WebSocket.OPEN) {
    return { connected: true, authenticated: socketAuthenticated };
  }
  if (socket?.readyState === WebSocket.CONNECTING && connectPromise) {
    return await connectPromise;
  }

  clearReconnectTimer();
  const runtimeSocket = new WebSocket(wsUrlFromConfig(cfg));
  socket = runtimeSocket;
  socketAuthenticated = false;
  connectPromise = new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      connectPromise = null;
      self.__tildeTrustedRuntimeLastConnect = result;
      resolve(result);
    };
    const timeout = setTimeout(() => {
      if (!socketAuthenticated && runtimeSocket.readyState === WebSocket.OPEN) {
        runtimeSocket.close();
      }
      settle({ connected: false, error: "runtime_authentication_ack_timeout" });
    }, AUTHENTICATION_ACK_TIMEOUT_MS);
    runtimeSocket.onopen = () => {
      sendOnSocket(runtimeSocket, { type: "authenticate", runtime_token: cfg.runtimeToken });
      sendOnSocket(runtimeSocket, { type: "runtime_ready" });
    };
    runtimeSocket.onerror = () => {
      settle({ connected: false, error: "websocket_error" });
    };
    runtimeSocket.onmessage = async (event) => {
      let command = null;
      try {
        command = JSON.parse(event.data);
        self.__tildeTrustedRuntimeLastCommand = {
          type: command.type ?? null,
          command_id: command.command_id ?? null,
          receivedAt: Date.now()
        };
        if (command.type === "runtime_authenticated") {
          clearTimeout(timeout);
          socketAuthenticated = true;
          consecutiveUnauthenticatedFailures = 0;
          settle({ connected: true, authenticated: true, tokenLength: cfg.runtimeToken.length });
          return;
        }
        if (command.type === "capture_dom") {
          const snapshot = await sendToRuntimeTab(command);
          self.__tildeTrustedRuntimeLastCapture = {
            command_id: command.command_id,
            respondedAt: Date.now(),
            hasError: Boolean(snapshot?.error),
            fieldCount: Number(snapshot?.fields?.length ?? 0)
          };
          sendOnSocket(runtimeSocket, {
            type: "dom_snapshot_result",
            command_id: command.command_id,
            snapshot
          });
        }
        if (command.type === "fill_and_submit") {
          const result = await sendToRuntimeTab(command);
          self.__tildeTrustedRuntimeLastFill = {
            command_id: command.command_id,
            respondedAt: Date.now(),
            submitted: Boolean(result?.submitted),
            filled_fields_count: Number(result?.filled_fields_count ?? 0),
            error: result?.error ?? null
          };
          sendOnSocket(runtimeSocket, {
            type: "fill_form_result",
            command_id: command.command_id,
            submitted: Boolean(result?.submitted),
            filled_fields_count: Number(result?.filled_fields_count ?? 0),
            error: result?.error ?? null
          });
        }
      } catch (error) {
        self.__tildeTrustedRuntimeLastError = {
          command_id: command?.command_id ?? null,
          error: String(error),
          at: Date.now()
        };
        sendOnSocket(runtimeSocket, {
          type: "runtime_error",
          command_id: command?.command_id ?? null,
          error: String(error)
        });
      }
    };
    runtimeSocket.onclose = (event) => {
      clearTimeout(timeout);
      self.__tildeTrustedRuntimeLastClose = {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        authenticated: socketAuthenticated
      };
      const wasAuthenticated = socketAuthenticated;
      if (socket === runtimeSocket) {
        socket = null;
        socketAuthenticated = false;
      }
      if (!wasAuthenticated) {
        recordUnauthenticatedFailure("websocket_closed_before_authentication_ack");
      }
      settle({
        connected: false,
        authenticated: wasAuthenticated,
        closeCode: event.code,
        closeReason: event.reason
      });
      if (!stopped) scheduleReconnect(wasAuthenticated ? "authenticated_socket_closed" : "unauthenticated_socket_closed");
    };
  });
  return await connectPromise;
}

self.__tildeTrustedRuntimeConnect = connect;
chrome.runtime.onInstalled.addListener(() => {
  connect();
});
chrome.runtime.onStartup.addListener(() => {
  connect();
});
setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN && socketAuthenticated) {
    sendOnSocket(socket, { type: "heartbeat" });
  }
}, 5000);
