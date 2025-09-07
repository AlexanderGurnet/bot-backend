import express from 'express'
import https from 'https'
import http from 'http'
import fs from 'fs'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import cors from 'cors'

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

// --- Rate limiting
const limiter = rateLimit({ windowMs: 60_000, max: 10 })
app.use(limiter)

// --- Telegram config
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS.split(',').map((id) => id.trim()) || []

if (!BOT_TOKEN || ADMIN_IDS.length === 0) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env')
}

// --- Markdown escape
function escapeMdV2(text = '') {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

// --- Send message
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const payload = { chat_id: chatId, text, parse_mode: 'MarkdownV2' }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
  return data.result
}

// --- API endpoint
app.post('/api/submit', async (req, res) => {
  try {
    const { name, contact, description } = req.body || {}
    if (!name || !contact || !description) return res.status(400).json({ ok: false, error: 'required fields' })

    const message =
      `📩 *Новый бриф с лендинга*\n` +
      `*Имя:* ${escapeMdV2(name)}\n` +
      `*Контакт:* ${escapeMdV2(contact)}\n` +
      `*Задача:*\n${escapeMdV2(description)}`

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

// --- SSL
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/apibotlabs.space/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/apibotlabs.space/fullchain.pem'),
}

// --- HTTP → HTTPS redirect
http
  .createServer((req, res) => {
    res.writeHead(301, { Location: 'https://' + req.headers['host'] + req.url })
    res.end()
  })
  .listen(80, () => console.log('Redirecting HTTP → HTTPS on port 80'))

// --- HTTPS server
https.createServer(sslOptions, app).listen(443, () => {
  console.log('🚀 API listening on https://apibotlabs.space')
})
