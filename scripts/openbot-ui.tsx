import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Text, useApp, useInput } from "ink";

export interface RepositoryCounts {
  digest: string;
  agents: number;
  skills: number;
  providers: number;
}

export interface ProviderStatus {
  id: string;
  kind: string;
  healthy: boolean;
  configured: boolean;
  displayName: string;
  message?: string;
}

export interface SyncReportView {
  digest: string;
  skipped?: string;
  registryId?: string;
  skills: readonly { name: string; status: string }[];
  agents: readonly { id: string; status: string }[];
  errors: readonly string[];
}

const commands = [
  ["setup", "Create the fork-owned configuration directories"],
  ["check", "Validate committed repository configuration"],
  ["doctor", "Validate configuration and provider connectivity"],
  ["dev", "Start the local OpenBot development environment"],
  ["status", "Show registered agents and skills"],
  ["sync", "Reconcile committed configuration with providers"],
  ["providers list", "Inspect every configured provider"],
  ["deploy --yes", "Deploy the current fork to production"],
] as const;

const menuItems = [
  { command: "doctor", description: "Check whether this fork is ready" },
  { command: "setup", description: "Create configuration directories" },
  { command: "status", description: "Inspect registrations" },
  { command: "dev", description: "Start local development" },
  { command: "help", description: "Show every command" },
] as const;

export function Brand({ subtitle }: { subtitle?: string }) {
  return <Box flexDirection="column" marginBottom={1}>
    <Text bold color="cyan">OPENBOT</Text>
    <Text dimColor>{subtitle ?? "Fork it. Configure it. Run it."}</Text>
  </Box>;
}

export function Help() {
  return <Box flexDirection="column">
    <Brand />
    <Text bold>Usage</Text>
    <Text>  pnpm openbot <Text color="cyan">&lt;command&gt;</Text> <Text dimColor>[options]</Text></Text>
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Commands</Text>
      {commands.map(([command, description]) => <Box key={command}>
        <Box width={24}><Text color="cyan">{command}</Text></Box>
        <Text>{description}</Text>
      </Box>)}
    </Box>
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>Run without a command for the interactive launcher.</Text>
      <Text dimColor>Add --json to check, doctor, status, sync, or providers list for automation.</Text>
    </Box>
  </Box>;
}

export function CommandMenu({ onSelect }: { onSelect: (command: string) => void }) {
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      selectedRef.current = (selectedRef.current - 1 + menuItems.length) % menuItems.length;
      setSelected(selectedRef.current);
    }
    if (key.downArrow || input === "j") {
      selectedRef.current = (selectedRef.current + 1) % menuItems.length;
      setSelected(selectedRef.current);
    }
    if (key.return) {
      onSelect(menuItems[selectedRef.current]!.command);
      exit();
    }
    if (key.escape || input === "q") exit();
  });
  return <Box flexDirection="column">
    <Brand subtitle="What would you like to do?" />
    {menuItems.map((item, index) => <Box key={item.command}>
      <Box width={3}><Text color={selected === index ? "cyan" : undefined}>{selected === index ? "❯" : " "}</Text></Box>
      <Box width={13}><Text bold={selected === index} color={selected === index ? "cyan" : undefined}>{item.command}</Text></Box>
      <Text dimColor={selected !== index}>{item.description}</Text>
    </Box>)}
    <Box marginTop={1}><Text dimColor>↑/↓ move  enter select  q quit</Text></Box>
  </Box>;
}

export function Progress({ label }: { label: string }) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => (value + 1) % frames.length), 80);
    return () => clearInterval(timer);
  }, [frames.length]);
  return <Box><Text color="cyan">{frames[frame]}</Text><Text> {label}</Text></Box>;
}

export function Success({ title, children }: { title: string; children?: ReactNode }) {
  return <Box flexDirection="column">
    <Text><Text color="green">✓</Text> <Text bold>{title}</Text></Text>
    {children ? <Box marginLeft={2} flexDirection="column">{children}</Box> : null}
  </Box>;
}

export function Failure({ message }: { message: string }) {
  return <Box borderStyle="round" borderColor="red" paddingX={1}>
    <Text color="red">Error: </Text><Text>{message}</Text>
  </Box>;
}

export function RepositorySummary({ repository, title = "Configuration is valid" }: { repository: RepositoryCounts; title?: string }) {
  return <Success title={title}>
    <Text><Text dimColor>Digest</Text>  {repository.digest.slice(0, 12)}</Text>
    <Text><Text color="cyan">{repository.agents}</Text> agent(s) · <Text color="cyan">{repository.skills}</Text> skill(s) · <Text color="cyan">{repository.providers}</Text> custom provider plugin(s)</Text>
  </Success>;
}

export function ProviderTable({ providers, heading = "Providers" }: { providers: readonly ProviderStatus[]; heading?: string }) {
  return <Box flexDirection="column">
    <Text bold>{heading}</Text>
    {providers.map((provider) => <Box key={`${provider.kind}:${provider.id}`} flexDirection="column" marginBottom={provider.message ? 1 : 0}>
      <Box>
        <Box width={3}><Text color={provider.healthy ? "green" : "yellow"}>{provider.healthy ? "✓" : "!"}</Text></Box>
        <Box width={18}><Text>{provider.kind}</Text></Box>
        <Box width={26}><Text bold>{provider.displayName}</Text></Box>
        <Text color={provider.healthy ? "green" : "yellow"}>{provider.healthy ? "ready" : provider.configured ? "unhealthy" : "needs setup"}</Text>
      </Box>
      {provider.message ? <Box marginLeft={3}><Text dimColor>{provider.message}</Text></Box> : null}
    </Box>)}
  </Box>;
}

export function DoctorResult({ repository, providers }: { repository: RepositoryCounts; providers: readonly ProviderStatus[] }) {
  return <Box flexDirection="column">
    <RepositorySummary repository={repository} />
    <Box marginTop={1}><ProviderTable providers={providers} /></Box>
  </Box>;
}

export function StatusResult({ agents, skills }: { agents: readonly { sourceId: string; status: string }[]; skills: readonly { name: string; status: string }[] }) {
  return <Box flexDirection="column">
    <Brand subtitle="Repository registrations" />
    <Text><Text color="cyan">{agents.length}</Text> agents · <Text color="cyan">{skills.length}</Text> skills</Text>
    {agents.map((agent) => <Text key={agent.sourceId}><Text color={agent.status === "ready" ? "green" : "yellow"}>●</Text> agent  {agent.sourceId} <Text dimColor>({agent.status})</Text></Text>)}
    {skills.map((skill) => <Text key={skill.name}><Text color={skill.status === "ready" ? "green" : "yellow"}>●</Text> skill  {skill.name} <Text dimColor>({skill.status})</Text></Text>)}
  </Box>;
}

export function SyncResult({ report }: { report: SyncReportView }) {
  const successful = report.errors.length === 0;
  return <Box flexDirection="column">
    <Success title={report.skipped ? "Sync skipped" : successful ? "Repository synchronized" : "Sync completed with errors"}>
      <Text><Text dimColor>Digest</Text>  {report.digest.slice(0, 12)}</Text>
      {report.skipped ? <Text color="yellow">{report.skipped}</Text> : <Text>{report.agents.length} agent(s) · {report.skills.length} skill(s)</Text>}
      {report.agents.map((agent) => <Text key={agent.id}><Text color={agent.status === "ready" ? "green" : "yellow"}>●</Text> {agent.id} <Text dimColor>{agent.status}</Text></Text>)}
      {report.errors.map((error) => <Text key={error} color="red">{error}</Text>)}
    </Success>
  </Box>;
}
