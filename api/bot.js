import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  const BOT_RUNNER_URL = process.env.BOT_RUNNER_URL; // e.g. Your Modal or Railway webhook
  
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: 'Missing DAILY_API_KEY on server' });
  }

  try {
    // 1. Create a Daily Room
    const roomResponse = await axios.post('https://api.daily.co/v1/rooms', {
      properties: {
        exp: Math.round(Date.now() / 1000) + 3600,
        enable_chat: true,
        enable_recording: "cloud",
        start_audio_off: false,
      }
    }, {
      headers: { 
        Authorization: `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const room = roomResponse.data;

    // 2. Create an owner token for the bot
    const tokenResponse = await axios.post('https://api.daily.co/v1/meeting-tokens', {
      properties: {
        room_name: room.name,
        is_owner: true,
      }
    }, {
      headers: { 
        Authorization: `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const botToken = tokenResponse.data.token;

    // 3. Trigger the Bot Runner
    // If you have a BOT_RUNNER_URL configured (Modal/Railway/etc), we call it.
    // Otherwise, we return the details for manual/local execution.
    if (BOT_RUNNER_URL) {
      try {
        await axios.post(BOT_RUNNER_URL, {
          room_url: room.url,
          token: botToken
        });
      } catch (triggerError) {
        console.error('Failed to trigger bot runner:', triggerError.message);
        // We continue anyway so the user can at least see the room details
      }
    }

    return res.status(200).json({
      room_url: room.url,
      bot_status: BOT_RUNNER_URL ? 'spawned' : 'manual_start_required',
      room_name: room.name,
      bot_token: botToken,
      instructions: !BOT_RUNNER_URL ? `Run: python bot.py ${room.url} ${botToken}` : undefined
    });

  } catch (error) {
    console.error('Daily API Error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to initialize call session',
      details: error.response?.data?.error || error.message 
    });
  }
}
