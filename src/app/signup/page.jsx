'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Signup() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [file, setFile] = useState(null);
    const router = useRouter();
    const handleSubmit = async e => {
        e.preventDefault();
        const data = new FormData();
        data.append('username', username);
        data.append('password', password);
        data.append('action', 'signup');
        if (file) data.append('avatar', file);
        const res = await fetch('/api/auth', { method: 'POST', body: data });
        if (res.ok) router.push('/login');
    };
    return (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold mb-4">Sign Up</h2>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full mb-2 p-2 border rounded" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full mb-4 p-2 border rounded" />
            <input type="file" onChange={e => setFile(e.target.files[0])} className="mb-4" />
            <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded">Sign Up</button>
    </form>
    )
}
