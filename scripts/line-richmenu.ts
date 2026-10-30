// Creates the bot's rich menu from docs/brand/line-richmenu.png and makes it
// the default for every user. The buttons send postbacks that
// src/lib/line/bot.ts answers (menu:help, menu:query, menu:cutoff,
// menu:bill-last, menu:bill-this).
//   npm run line:richmenu            add the menu and set it as default
//   npm run line:richmenu -- --replace   also delete every other rich menu
// --replace is needed when old menus are linked to individual users: a
// per-user menu wins over the default. Needs LINE_CHANNEL_ACCESS_TOKEN.
import "dotenv/config";
import { readFile } from "node:fs/promises";

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";
const IMAGE = "docs/brand/line-richmenu.png";
const WIDTH = 2500;
const HEIGHT = 1686;
const ROW = HEIGHT / 2;

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

async function call(method: string, url: string, body?: BodyInit, type = "application/json") {
  const res = await fetch(url, { method, headers: { ...auth, ...(body && { "Content-Type": type }) }, body });
  if (!res.ok) throw new Error(`${method} ${url} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Top row: three buttons; bottom row: two. Matches docs/brand/line-richmenu.svg.
const rows = [
  [
    { data: "menu:help", label: "我要訂餐" },
    { data: "menu:query", label: "查詢訂單" },
    { data: "menu:cutoff", label: "截止時間" },
  ],
  [
    { data: "menu:bill-last", label: "上月帳單" },
    { data: "menu:bill-this", label: "本月帳單" },
  ],
];

async function main() {
  const replace = process.argv.includes("--replace");
  const { richMenuId } = await call(
    "POST",
    `${API}/richmenu`,
    JSON.stringify({
      size: { width: WIDTH, height: HEIGHT },
      selected: true,
      name: "永發便當",
      chatBarText: "永發便當選單",
      areas: rows.flatMap((buttons, r) => {
        const cell = Math.floor(WIDTH / buttons.length);
        return buttons.map((b, i) => ({
          bounds: { x: i * cell, y: r * ROW, width: i === buttons.length - 1 ? WIDTH - i * cell : cell, height: ROW },
          action: { type: "postback", data: b.data, displayText: b.label },
        }));
      }),
    }),
  );
  await call("POST", `${DATA_API}/richmenu/${richMenuId}/content`, await readFile(IMAGE), "image/png");
  await call("POST", `${API}/user/all/richmenu/${richMenuId}`);
  console.log(`default rich menu: ${richMenuId}`);

  if (replace) {
    const { aliases = [] } = await call("GET", `${API}/richmenu/alias/list`);
    for (const a of aliases as { richMenuAliasId: string }[]) {
      await call("DELETE", `${API}/richmenu/alias/${a.richMenuAliasId}`);
    }
    const { richmenus } = await call("GET", `${API}/richmenu/list`);
    const old = (richmenus as { richMenuId: string }[]).filter((m) => m.richMenuId !== richMenuId);
    for (const m of old) await call("DELETE", `${API}/richmenu/${m.richMenuId}`);
    console.log(`deleted ${aliases.length} aliases and ${old.length} other rich menus`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
