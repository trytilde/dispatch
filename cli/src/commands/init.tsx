import React, { useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { initializeOpenBot, type InitializationPrompts, type SelectChoice } from "../initialization.js";
import { repositoryRoot } from "../paths.js";
import { Brand } from "../ui.js";

export async function runInitialization(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("openbot init requires an interactive terminal");
  await initializeOpenBot({ repositoryRoot, prompts: inkPrompts });
}

export const inkPrompts: InitializationPrompts = {
  select(prompt, choices) {
    return renderQuestion<string>((complete, cancel) => <SelectQuestion prompt={prompt} choices={choices} complete={complete} cancel={cancel} />);
  },
  input(prompt, options = {}) {
    return renderQuestion<string>((complete, cancel) => <InputQuestion prompt={prompt} secret={options.secret ?? false} required={options.required ?? false} complete={complete} cancel={cancel} />);
  },
};

async function renderQuestion<T>(view: (complete: (value: T) => void, cancel: () => void) => React.ReactElement): Promise<T> {
  let resolveValue!: (value: T) => void;
  let rejectValue!: (error: Error) => void;
  const result = new Promise<T>((resolvePromise, reject) => {
    resolveValue = resolvePromise;
    rejectValue = reject;
  });
  const app = render(view(resolveValue, () => rejectValue(new Error("Initialization cancelled"))), { patchConsole: false });
  await app.waitUntilExit();
  return result;
}

function SelectQuestion({ prompt, choices, complete, cancel }: {
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
  return <Box flexDirection="column">
    <Brand subtitle={prompt} />
    {choices.map((choice, index) => <Box key={choice.value} flexDirection="column">
      <Box>
        <Box width={3}><Text color={selected === index ? "cyan" : undefined}>{selected === index ? "❯" : " "}</Text></Box>
        <Text bold={selected === index} color={selected === index ? "cyan" : undefined}>{choice.label}</Text>
      </Box>
      {choice.description && selected === index ? <Box marginLeft={3}><Text dimColor>{choice.description}</Text></Box> : null}
    </Box>)}
    <Box marginTop={1}><Text dimColor>↑/↓ move  enter select  esc cancel</Text></Box>
  </Box>;
}

function InputQuestion({ prompt, secret, required, complete, cancel }: {
  prompt: string;
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
  return <Box flexDirection="column">
    <Brand subtitle={prompt} />
    <Text><Text color="cyan">❯ </Text>{secret ? "•".repeat(value.length) : value}<Text inverse> </Text></Text>
    {error ? <Text color="red">{error}</Text> : null}
    <Box marginTop={1}><Text dimColor>enter continue  esc cancel</Text></Box>
  </Box>;
}
