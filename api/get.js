let database = {};

export default function handler(req, res) {
    const { id } = req.query;

    if (!id || !database[id]) {
        return res.status(404).send("Không tìm thấy script");
    }

    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(database[id]);
}
