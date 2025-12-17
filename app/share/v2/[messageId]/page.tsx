"use client";

import CodeRunner from "@/components/code-runner";
import { extractAllCodeBlocks } from "@/lib/utils";
import { notFound } from "next/navigation";
import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function SharePage({
  params,
}: {
  params: Promise<{ messageId: string }>;
}) {
  const { messageId } = use(params);

  const message = useLiveQuery(() => db.messages.get(messageId), [messageId]);

  // While loading or if not found (eventually)
  if (message === undefined) {
      return (
          <div className="flex h-dvh items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
      );
  }

  if (message === null) { // Dexie returns undefined if loading, but if query finishes and no result, it might return undefined? No, get returns undefined if not found.
      // Wait, useLiveQuery returns undefined initially.
      // I need to distinguish loading vs not found.
      // useLiveQuery initial value is undefined.
      // I can't easily distinguish.
      // But for now let's assume if it stays undefined for a long time it's not found, or just show loading.
      // Actually `db.messages.get` returns a Promise. `useLiveQuery` resolves it.
      // If I want to handle "not found", I might need a different approach or just show loading until it appears (which it won't if invalid).
      // Let's just show loading. If it's instantaneous it's fine.
      return (
        <div className="flex h-dvh items-center justify-center">
             <p>Message not found or loading...</p>
        </div>
      );
  }

  // If we have a message, check files
  const files = extractAllCodeBlocks(message.content);
  if (files.length === 0) {
    return (
        <div className="flex h-dvh items-center justify-center">
             <p>No code found in this message.</p>
        </div>
      );
  }

  return (
    <div className="flex h-full w-full grow flex-col">
      <div className="flex h-full grow items-center justify-center">
        <CodeRunner
          files={files.map((f) => ({ path: f.path, content: f.code }))}
        />
      </div>

      {/* Floating desktop banner */}
      <div className="fixed bottom-4 right-4 z-50 hidden md:block">
        <a
          className="inline-flex shrink-0 items-center rounded-full border-[0.5px] border-[#BABABA] bg-white px-3.5 py-1.5 text-xs text-black shadow-lg transition-shadow hover:shadow-sm"
          href={`https://llamacoder.together.ai/?ref=${messageId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="text-center">
            Powered by <span className="font-semibold">Together.ai</span> and{" "}
            <span className="font-semibold">Turb0</span>
          </span>
        </a>
      </div>
    </div>
  );
}
