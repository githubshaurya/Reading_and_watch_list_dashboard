import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import multer from 'multer';
// import nc from 'next-connect';
import { createEdgeRouter } from 'next-connect';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectDB } from '../../../lib/db';
import { User } from '../../../models/User';

const SECRET = process.env.JWT_SECRET;

const upload = multer({ dest: 'public/avatars/' });
const handler = createEdgeRouter()
    .use(upload.single('avatar'))
    .post(async (req, res) => {
        await connectDB();
        const { action, username, password } = req.body;
        if (action === 'signup') {
            const hash = await bcrypt.hash(password, 10);
            const user = await User.create({ username, password: hash, avatarUrl: req.file ? `/avatars/${req.file.filename}` : '' });
            return res.status(201).json({ status: 'ok' });
        }
        if (action === 'login') {
            const user = await User.findOne({ username });
            if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).end();
            const token = jwt.sign({ id: user._id, username }, SECRET, { expiresIn: '7d' });
            return res.json({ token });
        }
    return res.status(400).end();
});

export const config = { api: { bodyParser: false } };
export default handler;