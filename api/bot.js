import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  
  if (!DAILY_API_KEY) {
    console.error('DAILY_API_KEY not found in environment variables');
    return res.status(500).json({ 
      error: 'Missing DAILY_API_KEY on server',
      message: 'Environment variable DAILY_API_KEY is not configured. Please set it in Vercel project settings.'
    });
  }

  try {
    console.log('Creating Daily.co room with API key:', DAILY_API_KEY.substring(0, 10) + '...');
    
    const roomResponse = await axios.post('https://api.daily.co/v1/rooms', {
      properties: {
        exp: Math.round(Date.now() / 1000) + 3600,
        enable_chat: true,
        // Cloud recording is not available on free plans and was causing 400 errors.
        // Removing it to ensure room creation works for all plan types.
        start_audio_off: false,
      }
    }, {
      headers: { 
        Authorization: `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const room = roomResponse.data;
    console.log('Room created successfully:', room.name);

    return res.status(200).json({
      room_url: room.url,
      bot_status: 'spawned',
      room_name: room.name
    });

  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message;
    const errorInfo = error.response?.data?.info || '';
    const errorStatus = error.response?.status || 500;
    
    console.error('Daily API Error:', {
      status: errorStatus,
      error: errorMessage,
      info: errorInfo,
      fullError: error.response?.data || error.message
    });
    
    return res.status(errorStatus === 401 || errorStatus === 403 ? 401 : 500).json({ 
      error: 'Failed to initialize call session',
      details: errorMessage,
      info: errorInfo,
      debugInfo: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
