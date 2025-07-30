'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SignupCallback() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session.user.isNewUser) {
      router.replace('/signup/complete-profile');
    } else {
      router.replace('/');
    }
  }, [status, session, router]);

  return <p>Signing you in…</p>;
}
