export function shouldExpandComposer(draft: string, hasAttachments: boolean): boolean {
  return draft.includes("\n") || hasAttachments;
}
