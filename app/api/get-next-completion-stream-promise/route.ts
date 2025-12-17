import { z } from "zod";
import Together from "together-ai";

function optimizeMessagesForTokens(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): { role: "system" | "user" | "assistant"; content: string }[] {
  // Strip code blocks from assistant messages except the last 2 to save tokens
  const assistantIndices: number[] = [];
  for (
    let i = messages.length - 1;
    i >= 0 && assistantIndices.length < 2;
    i--
  ) {
    if (messages[i].role === "assistant") {
      assistantIndices.push(i);
    }
  }
  return messages.map((msg, index) => {
    if (msg.role === "assistant" && !assistantIndices.includes(index)) {
      return {
        ...msg,
        content: msg.content.replace(/```[\s\S]*?```/g, "").trim(),
      };
    }
    return msg;
  });
}

export async function POST(req: Request) {
  // No Prisma usage. Messages are passed in the body.
  const { messages: rawMessages, model, chatId } = await req.json();

  let messages = z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .parse(rawMessages);

  messages = optimizeMessagesForTokens(messages);

  if (messages.length > 10) {
    messages = [messages[0], messages[1], messages[2], ...messages.slice(-7)];
  }

  let options: ConstructorParameters<typeof Together>[0] = {};
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-appname": "Turb0",
      "Helicone-Session-Id": chatId, // Optional if provided
      "Helicone-Session-Name": "Turb0 Chat",
    };
  }

  const together = new Together(options);

  const res = await together.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    temperature: 0.4,
    max_tokens: 9000,
  });

  return new Response(res.toReadableStream());
}

export const runtime = "edge";
export const maxDuration = 45;
