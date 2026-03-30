export default async function handler(req, res) {
  const { id } = req.query;

  const url = `https://apex-hub-global-ffd6a-default-rtdb.firebaseio.com/scripts/${id}.json`;

  const data = await fetch(url).then(r => r.json());

  if (!data) {
    return res.send("-- không tìm thấy");
  }

  res.setHeader("Content-Type", "text/plain");
  res.send(data.content);
}
