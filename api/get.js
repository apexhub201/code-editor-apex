export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.send("-- thiếu id");
  }

  try {
    const url = `https://apex-hub-global-ffd6a-default-rtdb.firebaseio.com/scripts/${id}.json`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.content) {
      return res.send("-- không tìm thấy");
    }

    res.setHeader("Content-Type", "text/plain");
    res.send(data.content);

  } catch (err) {
    console.error(err);
    res.send("-- lỗi server");
  }
}
