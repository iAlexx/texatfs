You're a Telegram automation expert and a Next.js/TypeScript engineer. We've successfully implemented the Userbot hybrid system, and group creation is working efficiently! Now, we need to improve the link creation process, simplify the user interface, and implement a robust online confirmation system using specific emojis within created forum threads.

Here's a breakdown of the required modifications:

---

### 1. Fix the group invite link creation process (`src/lib/telegram/userbot-client.ts`)

- Currently, the system returns an inaccessible internal message link (`t.me/c/...`) to users who haven't joined yet.

...
### 1. Fix the group invite link creation process (`src/lib/telegram/userbot-client.ts`)

Currently, the system returns an inaccessible internal message link (`t.me/c/...`) to users who haven't joined yet. - **Edit:** After creating the main group and enabling forum mode, use Userbot (`gramjs`) to export a clean, permanent invite link using the following code: `const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer: chatId }));`

- Extract the clean link (which looks like this: `https://t.me/+...`) and return it to the sent data so that the Bot API can send it to the main server and display it in the user interface.

-

### 2. Clean up the user interface and rename the files (`src/components/tma/ProfilePage.tsx`)

- Change the main button text from "إنشاء نظام التتبع (تلقائي)" to "**إنشاء مجموعة جاهزة**".

- **Completely remove** the collapsible manual activation menu ("Manual Activation Method"). Since the automated use of the Userbot is now fully reliable, we want to simplify the user interface.

--

### 3. Improve the pinned welcome message (`src/app/api/telegram/tracking/auto-create/route.ts`)

- Improve the pinned welcome message and instructions within the "⚙️ أوامر البوت" thread. Make them visually appealing and very clear.

- Add a demonstration showing how the system works. Use a test email to guide the user (e.g., `agent.demo@texas.com`).

-

### 4. Interactive confirmation process and change the emoticons to these new symbols (✅ and 🛑) - for groups only.
- Enable message event listeners for the official Telegram bot API (Webhook/Polling).

- **Important requirement:** These commands should only work within group forum threads (where `message.chat.type !== 'private'`). The bot must **completely ignore** these commands if sent via private messages (direct messages/private chats).

... - **Triggers (support for both raw emoji and command patterns):**

- Outgoing trigger: `✅[Amount]` or `/✅[Amount]` (Example: `✅90000` or `/✅90000`)

- Incoming trigger: `🛑[Amount]` or `/🛑[Amount]` (Example: 🛑`90000` or `/🛑90000`)

#### Interaction Mechanism:

1. When a user sends a trigger within a thread, `[Amount]` is retrieved.

2. The `message.message_thread_id` (the current thread ID) is searched in the database to determine the email address of the sub-agent associated with that specific thread.

#### Interaction Mechanism:

1. When a user sends a stimulus within a thread, the `[amount]` is retrieved.

2. The `message.message_thread_id` (the current thread ID) is searched in the database to identify the sub-agent email address associated with that thread. 3. The bot must respond directly within the same conversation with a clear Markdown message and an embedded keyboard:

**For outgoing payments (✅):**

"هل أنت متأكد أنك تريد إرسال مبلغ **[Amount]** إلى **[Sub-Agent Email]**؟"

**For incoming payments (🛑):**

"هل أنت متأكد أنك تريد استلام مبلغ **[Amount]** من **[Sub-Agent Email]**؟"

**Embedded buttons:**

`[Confirm]` `[Cancel]`

4. Execution of the `callback_query` handler:

- Clicking `Cancel` deletes or modifies the confirmation message to "❌ تم إلغاء العملية". Clicking "Confirm" executes the transaction logic and modifies the message to the final transaction status format shown below:

---

### 5. Update Transaction Status Labels
Upon successful transaction confirmation, the text is updated to follow this format:

- For outgoing transactions: "واصل منك ✅"

- For incoming transactions: "واصل الك 🛑"

Ensure that TypeScript is handled correctly, the data is free of translation errors, and it integrates seamlessly with existing Supabase schemas. Implement these changes completely.