// API endpoint for APEX AI using Groq
// File: api/ai.js
// API key được lấy từ Environment Variables - KHÔNG hard-code

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    const { messages, model } = req.body;

    // Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Messages array is required' 
      });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ 
          success: false,
          error: 'Each message must have role and content fields' 
        });
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid role. Must be system, user, or assistant' 
        });
      }
    }

    // Get API key from environment variable (SECURE - never exposed to frontend)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set in environment variables');
      return res.status(500).json({ 
        success: false,
        error: 'API key not configured on server. Please contact administrator.' 
      });
    }

    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    
    // Model selection with fallback
    const allowedModels = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b'
    ];
    
    const selectedModel = allowedModels.includes(model) 
      ? model 
      : 'openai/gpt-oss-120b';

    // Limit conversation history to prevent abuse
    const limitedMessages = messages.slice(-20);

    const requestBody = {
      model: selectedModel,
      messages: limitedMessages,
      max_tokens: 4000,
      temperature: 0.3,
      top_p: 0.9,
      stream: false
    };

    console.log(`APEX AI: Processing request with model ${selectedModel}, ${limitedMessages.length} messages`);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(50000) // 50 second timeout
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Groq API error:', {
        status: response.status,
        error: errorData.error?.message || 'Unknown error'
      });
      
      return res.status(response.status).json({ 
        success: false,
        error: errorData.error?.message || 'Groq API request failed',
        status: response.status
      });
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid response from Groq API:', data);
      return res.status(500).json({ 
        success: false,
        error: 'Invalid response from Groq API' 
      });
    }

    const aiContent = data.choices[0].message.content;

    console.log(`APEX AI: Response generated successfully (${aiContent.length} characters)`);

    return res.status(200).json({
      success: true,
      content: aiContent,
      model: data.model || selectedModel,
      usage: data.usage || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('APEX AI API error:', error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        success: false,
        error: 'Request timeout. Please try again.' 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error: ' + error.message 
    });
  }
}
