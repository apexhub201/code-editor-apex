// api/ai.js
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured. Please set GROQ_API_KEY environment variable.' 
      });
    }

    // Map model names to Groq models
    const modelMap = {
      'openai/gpt-oss-120b': 'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b': 'llama-3.1-8b-instant',
      'qwen/qwen3.6-27b': 'mixtral-8x7b-32768',
      'default': 'llama-3.3-70b-versatile'
    };

    const selectedModel = modelMap[model] || modelMap['default'];

    // Build messages with system prompt
    const systemPrompt = {
      role: 'system',
      content: 'You are APEX AI, an expert Roblox developer assistant specialized in Lua/Luau scripting. Help with Roblox scripts, debugging, optimization, and API usage. Always provide accurate, working code examples with proper formatting.'
    };

    const allMessages = [
      systemPrompt,
      ...messages.slice(-10) // Limit conversation history
    ];

    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    console.log('Calling Groq API with model:', selectedModel);
    console.log('Messages count:', allMessages.length);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: allMessages,
        max_tokens: 4000,
        temperature: 0.3,
        top_p: 0.9,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Groq API error:', response.status, errorData);
      return res.status(response.status).json({ 
        success: false, 
        error: errorData.error?.message || 'Groq API request failed with status ' + response.status
      });
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid Groq response:', data);
      return res.status(500).json({ success: false, error: 'Invalid response from Groq API' });
    }

    const content = data.choices[0].message.content;

    console.log('Groq API response successful');

    return res.status(200).json({
      success: true,
      content: content,
      model: selectedModel,
      usage: data.usage || null
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
};
