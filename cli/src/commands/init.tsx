import React, { useRef, useState } from "react";
import arg from "arg";
import { Box, Text, render, useApp, useInput } from "ink";
import {
  initializeOpenBot,
  processCommandRunner,
  type InitializationPrompts,
  type SelectChoice,
} from "../initialization.js";
import { repositoryRoot } from "../paths.js";
import { bootstrapOpenBotRepository } from "../repository-bootstrap.js";
import { Brand } from "../ui.js";

export interface InitializationRunResult {
  json: boolean;
  mode: "interactive" | "non-interactive";
}

export async function runInitialization(
  argv: readonly string[] = [],
): Promise<InitializationRunResult> {
  const parsed = arg(
    {
      "--non-interactive": Boolean,
      "--json": Boolean,
    },
    { argv: [...argv] },
  );
  if (parsed._.length) throw new Error(`Unknown init argument: ${parsed._.join(", ")}`);
  const nonInteractive = parsed["--non-interactive"] ?? false;
  const json = parsed["--json"] ?? false;
  if (!nonInteractive && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new Error(
      "openbot init requires an interactive terminal or --non-interactive with JSON answers on stdin",
    );
  const prompts = nonInteractive
    ? createNonInteractivePrompts(
        validateNonInteractiveCoreAnswers(await readJsonAnswersFromStdin()),
      )
    : inkPrompts;
  await bootstrapOpenBotRepository({
    destination: repositoryRoot,
    prompts,
    runner: processCommandRunner,
  });
  await initializeOpenBot({ repositoryRoot, prompts });
  return { json, mode: nonInteractive ? "non-interactive" : "interactive" };
}

export function validateNonInteractiveCoreAnswers(
  answers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const required = ["repository-name", "repository-visibility", "owner-identity", "runtime"];
  const ownerRequired: Record<string, readonly string[]> = {
    "aws-kms": ["aws-kms-key-arn"],
    "gcp-kms": ["gcp-kms-resource-id"],
    "azure-key-vault": ["azure-key-vault-key-url"],
    "vault-transit": ["vault-transit-key-uri"],
    onepassword: ["onepassword-vault", "onepassword-item-title"],
    "native-age": [],
  };
  const runtimeRequired: Record<string, readonly string[]> = {
    local: [],
    vercel: [
      "vercel-token",
      "vercel-control-project",
      "vercel-agent-project",
      "computer-image-repository",
    ],
  };
  const owner = answers["owner-identity"];
  const runtime = answers.runtime;
  if (owner && !ownerRequired[owner])
    throw new Error(`Invalid non-interactive answer for owner-identity: ${owner}`);
  if (runtime && !runtimeRequired[runtime])
    throw new Error(`Invalid non-interactive answer for runtime: ${runtime}`);
  required.push(...(owner ? (ownerRequired[owner] ?? []) : []));
  required.push(...(runtime ? (runtimeRequired[runtime] ?? []) : []));
  for (const id of required)
    if (answers[id] === undefined || answers[id] === "")
      throw new Error(`Missing required non-interactive answer: ${id}`);
  return answers;
}

export function createNonInteractivePrompts(
  answers: Readonly<Record<string, string>>,
): InitializationPrompts {
  const answer = (id: string | undefined, prompt: string, required: boolean): string => {
    if (!id) throw new Error(`Non-interactive question has no stable ID: ${prompt}`);
    const value = answers[id];
    if (value === undefined && !required) return "";
    if (value === undefined) throw new Error(`Missing non-interactive answer: ${id} (${prompt})`);
    if (required && !value) throw new Error(`Non-interactive answer must not be empty: ${id}`);
    return value;
  };
  return {
    async input(prompt, options = {}) {
      return answer(options.id, prompt, options.required ?? false);
    },
    async select(prompt, choices, options = {}) {
      const value = answer(options.id, prompt, true);
      if (!choices.some((choice) => choice.value === value))
        throw new Error(
          `Invalid non-interactive answer for ${options.id}: ${value}; expected one of ${choices.map((choice) => choice.value).join(", ")}`,
        );
      return value;
    },
  };
}

async function readJsonAnswersFromStdin(): Promise<Record<string, string>> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error("Non-interactive init requires a JSON object on stdin");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Non-interactive init stdin is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Non-interactive init stdin must be a JSON object");
  const answers: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value !== "string")
      throw new Error(`Non-interactive answer must be a string: ${id}`);
    answers[id] = value;
  }
  return answers;
}

export const inkPrompts: InitializationPrompts = {
  select(prompt, choices) {
    return renderQuestion<string>((complete, cancel) => (
      <SelectQuestion prompt={prompt} choices={choices} complete={complete} cancel={cancel} />
    ));
  },
  input(prompt, options = {}) {
    return renderQuestion<string>((complete, cancel) => (
      <InputQuestion
        prompt={prompt}
        description={options.description}
        secret={options.secret ?? false}
        required={options.required ?? false}
        complete={complete}
        cancel={cancel}
      />
    ));
  },
};

async function renderQuestion<T>(
  view: (complete: (value: T) => void, cancel: () => void) => React.ReactElement,
): Promise<T> {
  let resolveValue!: (value: T) => void;
  let rejectValue!: (error: Error) => void;
  const result = new Promise<T>((resolvePromise, reject) => {
    resolveValue = resolvePromise;
    rejectValue = reject;
  });
  const app = render(
    view(resolveValue, () => rejectValue(new Error("Initialization cancelled"))),
    { patchConsole: false },
  );
  await app.waitUntilExit();
  return result;
}

function SelectQuestion({
  prompt,
  choices,
  complete,
  cancel,
}: {
  prompt: string;
  choices: readonly SelectChoice[];
  complete: (value: string) => void;
  cancel: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      selectedRef.current = (selectedRef.current - 1 + choices.length) % choices.length;
      setSelected(selectedRef.current);
    } else if (key.downArrow || input === "j") {
      selectedRef.current = (selectedRef.current + 1) % choices.length;
      setSelected(selectedRef.current);
    } else if (key.return) {
      complete(choices[selectedRef.current]!.value);
      exit();
    } else if (key.escape) {
      cancel();
      exit();
    }
  });
  return (
    <Box flexDirection="column">
      <Brand subtitle={prompt} />
      {choices.map((choice, index) => (
        <Box key={choice.value} flexDirection="column">
          <Box>
            <Box width={3}>
              <Text color={selected === index ? "cyan" : undefined}>
                {selected === index ? "❯" : " "}
              </Text>
            </Box>
            <Text bold={selected === index} color={selected === index ? "cyan" : undefined}>
              {choice.label}
            </Text>
          </Box>
          {choice.description && selected === index ? (
            <Box marginLeft={3}>
              <Text dimColor>{choice.description}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ move enter select esc cancel</Text>
      </Box>
    </Box>
  );
}

function InputQuestion({
  prompt,
  description,
  secret,
  required,
  complete,
  cancel,
}: {
  prompt: string;
  description?: string;
  secret: boolean;
  required: boolean;
  complete: (value: string) => void;
  cancel: () => void;
}) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const [error, setError] = useState("");
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.escape) {
      cancel();
      exit();
      return;
    }
    if (key.return) {
      if (required && !valueRef.current) {
        setError("A value is required");
        return;
      }
      complete(valueRef.current);
      exit();
      return;
    }
    if (key.backspace || key.delete) valueRef.current = valueRef.current.slice(0, -1);
    else if (!key.ctrl && !key.meta && input) valueRef.current += input;
    setValue(valueRef.current);
    setError("");
  });
  return (
    <Box flexDirection="column">
      <Brand subtitle={prompt} />
      {description ? <Text dimColor>{description}</Text> : null}
      <Text>
        <Text color="cyan">❯ </Text>
        {secret ? "•".repeat(value.length) : value}
        <Text inverse> </Text>
      </Text>
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>enter continue esc cancel</Text>
      </Box>
    </Box>
  );
}
