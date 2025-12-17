"use client";

import LogoSmall from "@/components/icons/logo-small";
import {
  parseReplySegments,
  extractFirstCodeBlock,
  extractAllCodeBlocks,
} from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, startTransition, use, useEffect, useRef, useState, useMemo } from "react";
import { ChatCompletionStream } from "together-ai/lib/ChatCompletionStream.mjs";
import ChatBox from "./chat-box";
import ChatLog from "./chat-log";
import CodeViewer from "./code-viewer";
import CodeViewerLayout from "./code-viewer-layout";
import { Context } from "../../providers";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ChatWithMessages, Message } from "@/lib/db";
import { nanoid } from "nanoid";

const HeaderChat = memo(({ chat }: { chat: ChatWithMessages }) => (
  <div className="flex items-center gap-4 px-4 py-4">
    <a href="/" target="_blank">
      <LogoSmall />
    </a>
    <p className="italic text-gray-500">{chat.title}</p>
  </div>
));

HeaderChat.displayName = "HeaderChat";

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const context = use(Context);
  const searchParams = useSearchParams();
  const router = useRouter();

  const chat = useLiveQuery(() => db.chats.get(id), [id]);
  const messages = useLiveQuery(
    () => db.messages.where("chatId").equals(id).sortBy("position"),
    [id]
  );

  const [streamPromise, setStreamPromise] = useState<
    Promise<ReadableStream> | undefined
  >(context.streamPromise);
  const [streamText, setStreamText] = useState("");
  const [isShowingCodeViewer, setIsShowingCodeViewer] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("preview");
  const isHandlingStreamRef = useRef(false);
  const [activeMessage, setActiveMessage] = useState<Message | undefined>(undefined);

  // Set initial active message
  useEffect(() => {
    if (messages && messages.length > 0 && !activeMessage) {
        const lastAssistantMessageWithCode = messages
            .filter((m) => m.role === "assistant" && extractFirstCodeBlock(m.content))
            .at(-1);
        if (lastAssistantMessageWithCode) {
            setActiveMessage(lastAssistantMessageWithCode);
            setIsShowingCodeViewer(true);
        }
    }
  }, [messages, activeMessage]);

  useEffect(() => {
    async function f() {
      if (!streamPromise || isHandlingStreamRef.current || !chat) return;

      isHandlingStreamRef.current = true;
      context.setStreamPromise(undefined);

      const stream = await streamPromise;
      let didPushToCode = false;
      let didPushToPreview = false;

      ChatCompletionStream.fromReadableStream(stream)
        .on("content", (delta, content) => {
          setStreamText((text) => text + delta);

          if (
            !didPushToCode &&
            parseReplySegments(content).some((seg) => seg.type === "file")
          ) {
            didPushToCode = true;
            setIsShowingCodeViewer(true);
            setActiveTab("code");
          }

          if (
            !didPushToPreview &&
            parseReplySegments(content).some(
              (seg) => seg.type === "file" && !seg.isPartial,
            )
          ) {
            didPushToPreview = true;
            setIsShowingCodeViewer(true);
          }
        })
        .on("finalContent", async (finalText) => {

            // Get all previous assistant messages with files
            const previousAssistantMessages = (messages || []).filter(
              (m) =>
                m.role === "assistant" &&
                extractAllCodeBlocks(m.content).length > 0,
            );

            // Extract all files from previous messages
            const previousFiles = previousAssistantMessages.flatMap((msg) =>
              extractAllCodeBlocks(msg.content),
            );

            // Extract files from current AI response
            const currentFiles = extractAllCodeBlocks(finalText);

            // Merge files (current overrides previous for same paths)
            const fileMap = new Map();
            previousFiles.forEach((file) => fileMap.set(file.path, file));
            currentFiles.forEach((file) => fileMap.set(file.path, file));
            const allFiles = Array.from(fileMap.values());

            const maxPosition = (messages?.length || 0) > 0
                ? Math.max(...(messages?.map(m => m.position) || [0]))
                : 0;

            const newMessageId = nanoid();
            const newMessage = {
                id: newMessageId,
                chatId: chat.id,
                role: "assistant",
                content: finalText,
                files: allFiles,
                position: maxPosition + 1,
                createdAt: new Date()
            };

            await db.messages.add(newMessage);

            isHandlingStreamRef.current = false;
            setStreamText("");
            setStreamPromise(undefined);
            setActiveMessage(newMessage);
            // When streaming finishes, switch to preview mode and keep the viewer open
            setIsShowingCodeViewer(true);
            setActiveTab("preview");
        });
    }

    f();
  }, [chat, messages, router, streamPromise, context]);

  if (!chat || !messages) {
      return (
          <div className="flex h-dvh items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
      );
  }

  // Construct the chat object expected by child components
  const fullChat = {
      ...chat,
      messages: messages,
      assistantMessagesCountBefore: 0, // Dexie loads all, so no pagination logic needed yet
      totalMessages: messages.length
  };

  async function handleCreateMessage(text: string, role: "user" | "assistant", files?: any[]) {
      const maxPosition = Math.max(...messages!.map((m) => m.position), 0);
      const newMessage = {
          id: nanoid(),
          chatId: chat!.id,
          role,
          content: text,
          files: files ? JSON.parse(JSON.stringify(files)) : null,
          position: maxPosition + 1,
          createdAt: new Date()
      };
      await db.messages.add(newMessage);
      return newMessage;
  }

  return (
    <div className="h-dvh">
      <div className="flex h-full">
        <div
          className={`flex w-full shrink-0 flex-col overflow-hidden ${isShowingCodeViewer ? "lg:w-[30%]" : "lg:w-full"}`}
        >
          <HeaderChat chat={fullChat} />

          <ChatLog
            chat={fullChat}
            streamText={streamText}
            activeMessage={activeMessage}
            onMessageClick={(message) => {
              if (message !== activeMessage) {
                setActiveMessage(message);
                setIsShowingCodeViewer(true);
              } else {
                setActiveMessage(undefined);
                setIsShowingCodeViewer(false);
              }
            }}
          />

          <ChatBox
            chat={fullChat}
            onNewStreamPromise={setStreamPromise}
            isStreaming={!!streamPromise}
          />
        </div>

        <CodeViewerLayout
          isShowing={isShowingCodeViewer}
          onClose={() => {
            setActiveMessage(undefined);
            setIsShowingCodeViewer(false);
          }}
        >
          {isShowingCodeViewer && (
            <CodeViewer
              streamText={streamText}
              chat={fullChat}
              message={activeMessage}
              onMessageChange={setActiveMessage}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={() => {
                setActiveMessage(undefined);
                setIsShowingCodeViewer(false);
              }}
              onRequestFix={(error: string) => {
                startTransition(async () => {
                  let newMessageText = `The code is not working. Can you fix it? Here's the error:\n\n`;
                  newMessageText += error.trimStart();

                  const message = await handleCreateMessage(newMessageText, "user");

                  const streamPromise = fetch(
                    "/api/get-next-completion-stream-promise",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        messages: [...messages!.map(m => ({role: m.role, content: m.content})), {role: message.role, content: message.content}],
                        model: chat!.model,
                        chatId: chat!.id
                      }),
                    },
                  ).then((res) => {
                    if (!res.body) {
                      throw new Error("No body on response");
                    }
                    return res.body;
                  });
                  setStreamPromise(streamPromise);
                });
              }}
              onRestore={async (
                message: Message | undefined,
                oldVersion: number,
                newVersion: number,
              ) => {
                startTransition(async () => {
                  if (!message) return;

                  // Helper to get files from a message (JSON field or extract from content)
                  const getFilesFromMessage = (msg: Message) => {
                    return (
                      (msg.files as any[]) || extractAllCodeBlocks(msg.content)
                    );
                  };

                  const restoredFiles = getFilesFromMessage(message);
                  if (restoredFiles.length === 0) return;

                  const explanation = `Version ${newVersion} was created by restoring version ${oldVersion}.`;
                  const newContent =
                    explanation +
                    "\n\n" +
                    restoredFiles
                      .map(
                        (file) =>
                          `\`\`\`${file.language}{path=${file.path}}\n${file.code}\n\`\`\``,
                      )
                      .join("\n\n");

                  const newMessage = await handleCreateMessage(newContent, "assistant", restoredFiles);
                  setActiveMessage(newMessage);
                });
              }}
            />
          )}
        </CodeViewerLayout>
      </div>
    </div>
  );
}
