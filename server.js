// server.js
import express from 'express'
import fetch from 'node-fetch' // Node 18+ has global fetch, can remove this
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import cors from 'cors'

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

// --- Rate limiting (10 requests per minute per IP)
const limiter = rateLimit({ windowMs: 60_000, max: 10 })
app.use(limiter)

// --- Load config from .env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS?.split(',').map((id) => id.trim()) || []

if (!BOT_TOKEN || ADMIN_IDS.length === 0) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_IDS not set in .env')
}

// --- Helper: escape MarkdownV2 special chars
function escapeMdV2(text = '') {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

// --- Helper: send message to Telegram
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await resp.json()
  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
  }
  return data.result
}

// --- API endpoint
app.post('/api/submit', async (req, res) => {
  try {
    const { name, contact, description } = req.body || {}

    if (!name || !contact || !description) {
      return res.status(400).json({ ok: false, error: 'required fields' })
    }

    const message =
      `📩 *Новый бриф с лендинга*\n` +
      `*Имя:* ${escapeMdV2(name)}\n` +
      `*Контакт:* ${escapeMdV2(contact)}\n` +
      `*Задача:*\n${escapeMdV2(description)}`

    // Send to all admins in whitelist
    const results = []
    for (const adminId of ADMIN_IDS) {
      try {
        const result = await sendTelegramMessage(adminId, message)
        results.push(result)
      } catch (err) {
        console.error(`Failed to send to ${adminId}:`, err.message)
      }
    }

    return res.json({ ok: true, sent_to: results.length })
  } catch (err) {
    console.error('Internal error:', err)
    return res.status(500).json({ ok: false, error: 'internal' })
  }
})

// --- Start server
const PORT = process.env.PORT || 5174
app.listen(PORT, () => console.log(`🚀 API listening on port ${PORT}`))
