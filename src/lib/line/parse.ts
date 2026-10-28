// Turns a customer's LINE message into a structured request with Claude.
// The model only reads the message; dates, prices, cutoffs and the actual
// order are decided by src/lib/line/bot.ts and src/lib/orders.ts.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MEAL_KINDS } from "../meals";

const MODEL = "claude-haiku-5-5";

const ParsedRequest = z.object({
  intent: z.enum(["order", "cancel", "query", "unclear"]),
  date: z.string().nullable(),
  slot: z.enum(["lunch", "dinner"]).nullable(),
  lines: z.array(
    z.object({
      kind: z.enum(MEAL_KINDS),
      quantity: z.number().int(),
      unit_price: z.number().int().nullable(),
      label: z.string().nullable(),
    }),
  ),
});

export type ParsedRequest = z.infer<typeof ParsedRequest>;

const SYSTEM = `你負責解析團膳客戶在 LINE 上傳來的訂餐訊息，只輸出結構化結果，不回覆客戶。

intent：
- order：設定份數。客戶說的數字一律是「設定成」該數量，不是增減。例如「葷改12」→ 葷 12；「素不要了」→ 素 0。
- cancel：取消整筆訂單（例如「今天不訂了」「明天取消」）。
- query：詢問目前訂了什麼。
- unclear：看不出要訂什麼、問其它事情，或份數不明確（例如「多一點」）。

date：客戶有指定日期才填 YYYY-MM-DD（依訊息中的今天日期推算「明天」「週五」等），沒講就填 null。
slot：午餐 lunch、晚餐 dinner；沒講就填 null。

lines（只列出客戶有提到的項目）：
- kind：meat_a 葷食（「葷」「一般」「便當」、沒講葷素時也算葷）、veg_a 素食、no_pork 無豬、no_beef 無牛、b B餐、other 其它特殊需求（例如「不吃辣」「少飯」，內容放 label）。
- quantity：份數整數。
- unit_price：客戶明確講了價位（例如「60元的」）才填，否則 null。
- label：只有 kind 為 other 時填寫內容，其它填 null。`;

let client: Anthropic | undefined;

export async function parseRequest(
  message: string,
  today: { date: string; weekday: string; time: string },
): Promise<ParsedRequest | null> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(ParsedRequest) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `今天是 ${today.date}（${today.weekday}），現在 ${today.time}。\n客戶訊息：\n${message}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    return null;
  }
  return response.parsed_output ?? null;
}
