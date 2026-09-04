function cssPath(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let selector = node.nodeName.toLowerCase();
    if (node.name) selector += `[name="${CSS.escape(node.name)}"]`;
    parts.unshift(selector);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function labelFor(input) {
  if (input.labels?.length) return Array.from(input.labels).map((l) => l.innerText).join(" ");
  const aria = input.getAttribute("aria-label");
  if (aria) return aria;
  return "";
}

function markRuntimeState(update) {
  try {
    const current = JSON.parse(document.documentElement.getAttribute("data-tilde-runtime-state") || "{}");
    const next = Object.assign(current, update, { href: location.href, title: document.title });
    document.documentElement.setAttribute("data-tilde-runtime-state", JSON.stringify(next));
  } catch (_error) {
    // Diagnostics only; runtime behavior must not depend on DOM attribute writes.
  }
}

function snapshot() {
  markRuntimeState({ lastSnapshotStarted: Date.now() });
  const fields = Array.from(document.querySelectorAll("input, textarea, select")).map((field) => ({
    selector: cssPath(field),
    tag: field.tagName.toLowerCase(),
    type: field.getAttribute("type") || "",
    name: field.getAttribute("name") || "",
    id: field.id || "",
    label: labelFor(field),
    placeholder: field.getAttribute("placeholder") || "",
    autocomplete: field.getAttribute("autocomplete") || ""
  }));
  const submit_candidates = Array.from(document.querySelectorAll("button, input[type='submit']")).map((button) => ({
    selector: cssPath(button),
    text: button.innerText || button.getAttribute("value") || "",
    type: button.getAttribute("type") || ""
  }));
  const result = {
    url: location.href,
    title: document.title,
    forms: Array.from(document.forms).map((form) => ({ selector: cssPath(form) })),
    fields,
    submit_candidates
  };
  markRuntimeState({ lastSnapshotCompleted: Date.now(), fieldCount: fields.length, submitCandidateCount: submit_candidates.length });
  return result;
}

function setFieldValue(field, value) {
  const descriptor = Object.getOwnPropertyDescriptor(field.__proto__, "value");
  descriptor?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillAndSubmit(command) {
  markRuntimeState({ lastFillStarted: Date.now(), lastFillCommandId: command.command_id ?? null });
  let count = 0;
  for (const item of command.field_values ?? []) {
    const field = document.querySelector(item.selector);
    if (!field) continue;
    setFieldValue(field, item.value);
    count += 1;
  }
  const submit = command.submit_selector ? document.querySelector(command.submit_selector) : document.querySelector("button[type='submit'], input[type='submit']");
  submit?.click();
  markRuntimeState({ lastFillCompleted: Date.now(), filledFieldsCount: count, submitted: Boolean(submit) });
  return { submitted: Boolean(submit), filled_fields_count: count };
}

// The content script never receives the runtime token. The extension service
// worker owns trusted runtime connectivity and relays DOM-only commands here.
chrome.runtime.onMessage.addListener((command, _sender, sendResponse) => {
  if (command.type === "capture_dom") {
    sendResponse(snapshot());
    return true;
  }
  if (command.type === "fill_and_submit") {
    try {
      sendResponse(fillAndSubmit(command));
    } catch (error) {
      sendResponse({ submitted: false, filled_fields_count: 0, error: String(error) });
    }
    return true;
  }
});

markRuntimeState({ contentScriptLoaded: Date.now() });
