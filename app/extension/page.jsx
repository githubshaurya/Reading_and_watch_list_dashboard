// app/extension/page.jsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function ExtensionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [extensionToken, setExtensionToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const generateToken = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/extension/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        setExtensionToken(data.token);
        setSuccess('Extension token generated successfully!');
      } else {
        setError(data.error || 'Failed to generate token');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(extensionToken);
      setSuccess('Token copied to clipboard!');
    } catch (err) {
      setError('Failed to copy token');
    }
  };

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6">Browser Extension Setup</h1>
          
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">How It Works</h2>
              <ul className="space-y-2 text-gray-700">
                <li>• Extension tracks articles you read and videos you watch</li>
                <li>• Uses local LLM to analyze content quality and generate summaries</li>
                <li>• Automatically adds high-quality content to your public profile</li>
                <li>• Respects your privacy - only quality content is shared</li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Setup Instructions</h2>
              <ol className="space-y-3 text-gray-700">
                <li><strong>1. Install Local LLM (Optional but Recommended)</strong>
                  <div className="ml-4 mt-2 p-3 bg-gray-100 rounded">
                    <code>curl -fsSL https://ollama.com/install.sh | sh</code><br/>
                    <code>ollama pull llama3.2:1b</code>
                  </div>
                </li>
                <li><strong>2. Generate Extension Token</strong>
                  <button
                    onClick={generateToken}
                    disabled={isLoading}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Generating...' : 'Generate Token'}
                  </button>
                </li>
                <li><strong>3. Install Browser Extension</strong>
                  <div className="ml-4 mt-2">
                    <a href="#download" className="text-blue-600 hover:underline">Download Extension</a>
                  </div>
                </li>
                <li><strong>4. Configure Extension</strong>
                  <div className="ml-4 mt-2 text-sm text-gray-600">
                    Use the generated token to authenticate the extension
                  </div>
                </li>
              </ol>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
                {success}
              </div>
            )}

            {extensionToken && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3">Your Extension Token</h3>
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={extensionToken}
                    readOnly
                    className="flex-1 p-3 border border-gray-300 rounded bg-white font-mono text-sm"
                  />
                  <button
                    onClick={copyToken}
                    className="px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Keep this token secure. It allows the extension to access your account.
                </p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Privacy & Settings</h3>
              <p className="text-gray-700 mb-3">
                The extension respects your privacy and only tracks content that meets quality thresholds.
                You can customize tracking settings in the extension popup.
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Minimum reading time: 30 seconds</li>
                <li>• Quality score threshold: 0.6/1.0</li>
                <li>• Excluded domains: Gmail, Calendar, etc.</li>
                <li>• Auto-tracking can be disabled anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}