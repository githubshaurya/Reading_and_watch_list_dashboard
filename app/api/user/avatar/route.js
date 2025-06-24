import nc from 'next-connect';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { connectDB } from '../../../../lib/db';
import { User } from '../../../../models/User';

const SECRET = process.env.JWT_SECRET;
const upload = multer({ dest: 'public/avatars/' });
const handler = nc()
    .use(upload.single('avatar'))
    .post(async (req, res) => {
        await connectDB();
        const { token } = req.body;
        try {
            const { id } = jwt.verify(token, SECRET);
            await User.findByIdAndUpdate(id, { avatarUrl: `/avatars/${req.file.filename}` });
            return res.json({ avatarUrl: `/avatars/${req.file.filename}` });
        } catch {
            return res.status(401).end();
        }
});
export const config = { api: { bodyParser: false } };