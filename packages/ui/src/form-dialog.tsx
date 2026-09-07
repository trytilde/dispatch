"use client";

import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { DialogClose, DialogContent } from "./components/ui/dialog.js";
import { cn } from "./lib/utils.js";

/** Padded form composition of the shared modal surface, with an accessible close control. */
export function FormDialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent {...props} className={cn("grid gap-5 p-6 pb-7", className)}>
      {children}
      <DialogClose
        aria-label="Close"
        className="absolute right-3 top-3 grid size-7 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink"
      >
        <XIcon aria-hidden className="size-4" />
      </DialogClose>
    </DialogContent>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "grid gap-2 pr-6 text-left [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_p]:m-0 [&_p]:text-[13px] [&_p]:font-normal [&_p]:text-ink-3",
        className,
      )}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={cn("flex flex-wrap items-center justify-end gap-2", className)} />
  );
}
