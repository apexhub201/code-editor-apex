// api/save.js
export default async function handler(req, res) {
  // Chỉ cho phép method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content, id } = req.body;

  if (!content || !id) {
    return res.status(400).json({ error: 'Missing content or id' });
  }

  try {
    // Tạo tên file với timestamp
    const timestamp = Date.now();
    const fileName = `raw_${timestamp}_${id}.lua`;
    
    // Nội dung file với header bảo vệ
    const fileContent = `--[ APEX HUB Protected Script
-- Generated at: ${new Date().toISOString()}
-- File ID: ${id}
--==========================================

${content}`;

    // Trả về URL (bạn có thể lưu lên storage service ở đây)
    // Ví dụ: lưu lên GitHub Gist, hoặc dịch vụ lưu trữ khác
    
    // Tạo URL giả định - trong thực tế bạn sẽ lưu lên storage
    const rawUrl = `https://${req.headers.host}/api/raw/${fileName}`;
    
    // Lưu tạm vào memory store (chỉ demo)
    if (!global.rawStore) global.rawStore = {};
    global.rawStore[fileName] = fileContent;
    
    return res.status(200).json({
      success: true,
      url: rawUrl,
      fileName: fileName,
      message: 'Raw created successfully'
    });
    
  } catch (error) {
    console.error('Error creating raw:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create raw file' 
    });
  }
}
