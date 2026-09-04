// api/ai.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { messages, model } = req.body;
    
    console.log('AI API called with model:', model);

    // Kiểm tra messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages are required' });
      return;
    }

    // Lấy API key từ environment
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set');
      res.status(500).json({ error: 'API key not configured' });
      return;
    }

    // Map model names
    const modelMap = {
      'openai/gpt-oss-120b': 'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b': 'llama-3.1-8b-instant',
      'qwen/qwen3.6-27b': 'mixtral-8x7b-32768'
    };
    
    const selectedModel = modelMap[model] || 'llama-3.3-70b-versatile';

    // Add system prompt
    const systemPrompt = {
      role: 'system',
      content: 'You are APEX AI, a Roblox Lua/Luau expert. Help with scripting, debugging, and optimization.'
    };

    const allMessages = [systemPrompt, ...messages.slice(-10)];

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: allMessages,
        max_tokens: 4000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      res.status(500).json({ error: 'AI service error' });
      return;
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]?.message?.content) {
      res.status(200).json({
        success: true,
        content: data.choices[0].message.content
      });
    } else {
      res.status(500).json({ error: 'Invalid response' });
    }

  } catch (error) {
    console.error('API handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
