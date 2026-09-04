// api/ai.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { messages, model } = req.body;
    
    console.log('AI API called');
    console.log('Model:', model);
    console.log('Messages:', messages?.length);

    // Kiểm tra GROQ_API_KEY
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
      console.log('GROQ_API_KEY not set, returning fallback response');
      // Trả về response mẫu khi chưa có API key
      return res.status(200).json({
        success: true,
        content: "Tôi là APEX AI. Để sử dụng tính năng AI đầy đủ, admin cần cấu hình GROQ_API_KEY trong Vercel Environment Variables.\n\nBạn có thể hỏi tôi về Lua/Luau, Roblox scripting, hoặc bất kỳ vấn đề lập trình nào khác."
      });
    }

    // Gọi Groq API
    const modelMap = {
      'openai/gpt-oss-120b': 'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b': 'llama-3.1-8b-instant',
      'qwen/qwen3.6-27b': 'mixtral-8x7b-32768'
    };
    
    const selectedModel = modelMap[model] || 'llama-3.3-70b-versatile';

    const systemPrompt = {
      role: 'system',
      content: 'You are APEX AI, a Roblox Lua/Luau expert.'
    };

    const allMessages = [systemPrompt, ...messages.slice(-10)];

    console.log('Calling Groq with model:', selectedModel);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: allMessages,
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    console.log('Groq response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq error:', errorText);
      
      // Trả về lỗi chi tiết
      return res.status(500).json({ 
        error: `Groq API error: ${response.status}`,
        details: errorText.substring(0, 500)
      });
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]?.message?.content) {
      return res.status(200).json({
        success: true,
        content: data.choices[0].message.content
      });
    }

    return res.status(500).json({ error: 'Invalid response from Groq' });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
}
