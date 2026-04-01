import logging, requests, re
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

TOKEN   = "8663767765:AAGS1Xmn3b6x6kFDF1UUxj1SPtBUY3kvrDs"
WEBHOOK = "http://localhost:8090/webhook"

logging.basicConfig(level=logging.INFO)

def clean_response(text):
    """Clean up response — remove redundant label lines before URLs."""
    lines = text.split("\n")
    cleaned = []
    skip_next = False

    for i, line in enumerate(lines):
        line = line.strip()

        # Skip empty lines at start
        if not cleaned and not line:
            continue

        # If this line is a label ending in colon before a URL line
        if line.endswith(":") and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line.startswith("http"):
                # Skip the label — the URL will speak for itself
                continue

        # If line is just a URL — show it plainly
        if line.startswith("http"):
            cleaned.append(line)
            continue

        cleaned.append(line)

    return "\n".join(cleaned).strip()

async def handle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    user = str(update.effective_user.username or update.effective_user.id)
    await update.message.chat.send_action("typing")
    try:
        r = requests.post(WEBHOOK, json={
            "text": text, "user": user, "platform": "telegram"
        }, timeout=35)
        reply = r.json().get("text", "Error contacting MIMIC server.")
    except Exception as e:
        reply = f"MIMIC server error: {str(e)[:100]}"

    reply = clean_response(reply)

    # Send as plain text — no parse mode, URLs show as plain text
    await update.message.reply_text(
        reply,
        disable_web_page_preview=True
    )

def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))
    print("MIMIC Telegram bot running — message @mimic_medimaging_bot")
    app.run_polling()

if __name__ == "__main__":
    main()
