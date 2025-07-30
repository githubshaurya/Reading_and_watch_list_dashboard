'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function ExtensionStatus() {
  const { data: session } = useSession();
  const [linkStatus, setLinkStatus] = useState(null);

  useEffect(() => {
    if (session) {
      checkExtensionStatus();
    }
  }, [session]);

  const checkExtensionStatus = async () => {
    try {
      const response = await fetch('/api/extension/auth');
      const data = await response.json();
      setLinkStatus(data);
    } catch (error) {
      console.error('Failed to check extension status:', error);
    }
  };

  if (!session || !linkStatus) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      {linkStatus.hasLinkedExtension ? (
        <p className="text-blue-800">
          ✅ Browser extension is linked and active
        </p>
      ) : (
        <div className="text-blue-800">
          <p className="mb-2">📱 Connect your browser extension for automatic content curation</p>
          <button 
            onClick={() => window.open('/extension/download', '_blank')}
            className="text-blue-600 underline text-sm"
          >
            Download Extension
          </button>
        </div>
      )}
    </div>
  );
}