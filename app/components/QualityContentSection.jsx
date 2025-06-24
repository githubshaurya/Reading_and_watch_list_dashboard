import React, { useState } from 'react';

const QualityContentSection = ({ extensionContent, username, isOwnProfile }) => {
  const [activeTab, setActiveTab] = useState('content');

  // Better error handling and debugging
  if (!extensionContent) {
    console.log('No extension content provided');
    return null;
  }

  if (extensionContent.error) {
    console.error('Extension content error:', extensionContent.error);
    if (isOwnProfile) {
      return (
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-800">Extension Content Error</h3>
          <p className="text-yellow-700 text-sm mt-1">{extensionContent.error}</p>
          {extensionContent.debug && (
            <pre className="text-xs mt-2 text-yellow-600 overflow-auto">
              {JSON.stringify(extensionContent.debug, null, 2)}
            </pre>
          )}
        </div>
      );
    }
    return null;
  }

  // Handle different data structures more robustly
  const items = Array.isArray(extensionContent) 
    ? extensionContent 
    : (extensionContent.items || extensionContent.content || []);
  
  const stats = extensionContent.stats || {};
  const threshold = extensionContent.threshold || 60; // Default to 60%
  const totalQualityItems = items.length;

  // Show debug info for own profile
  const showDebug = isOwnProfile && extensionContent.debug;

  console.log('Extension content stats:', {
    totalItems: totalQualityItems,
    threshold: threshold,
    hasStats: !!stats,
    debug: extensionContent.debug
  });

  const getScoreColor = (score) => {
    const percentage = score > 1 ? score : score * 100;
    if (percentage >= 90) return 'bg-green-100 text-green-800';
    if (percentage >= 80) return 'bg-blue-100 text-blue-800';
    if (percentage >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatScore = (score) => {
    const percentage = score > 1 ? score : Math.round(score * 100);
    return percentage;
  };

  if (totalQualityItems === 0) {
    return (
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">
          High-quality content discovered by {isOwnProfile ? 'your' : `${username}'s`} browser extension
        </h3>
        <div className="text-center py-8 text-gray-500">
          <p>No quality content discovered yet with the current threshold of {threshold}%.</p>
          {isOwnProfile && (
            <p className="mt-2 text-sm">
              Make sure your browser extension is installed and tracking content.
            </p>
          )}
        </div>
        {showDebug && (
          <div className="mt-4 p-4 bg-gray-50 border rounded-lg">
            <h4 className="font-semibold text-gray-800">Debug Information</h4>
            <pre className="text-xs mt-2 text-gray-600 overflow-auto">
              {JSON.stringify(extensionContent.debug, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">
        High-quality content discovered by {isOwnProfile ? 'your' : `${username}'s`} browser extension
      </h3>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('content')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'content'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Content ({totalQualityItems})
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={item._id || index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="hover:text-blue-600"
                    >
                      {item.title}
                    </a>
                  </h4>
                  {item.summary && (
                    <p className="text-gray-600 text-sm mb-3">{item.summary}</p>
                  )}
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span>{formatDate(item.createdAt)}</span>
                    <span>•</span>
                    <span>{item.domain}</span>
                    <span>•</span>
                    <span>{item.contentType}</span>
                    {item.likes > 0 && (
                      <>
                        <span>•</span>
                        <span>{item.likes} likes</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScoreColor(item.qualityScore)}`}>
                    {formatScore(item.qualityScore)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">
              {totalQualityItems} high-quality items discovered with scores above {threshold}%
            </p>
          </div>

          {/* Content Types */}
          {stats.contentTypes && stats.contentTypes.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Content Types</h4>
              <div className="space-y-2">
                {stats.contentTypes.map((type, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="capitalize">{type.type}</span>
                    <div className="text-sm text-gray-600">
                      {type.count} items • {type.avgScore}% avg score
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Domains */}
          {stats.topDomains && stats.topDomains.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Top Sources</h4>
              <div className="space-y-2">
                {stats.topDomains.map((domain, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span>{domain.domain}</span>
                    <div className="text-sm text-gray-600">
                      {domain.count} items • {domain.avgScore}% avg score
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Debug Information (only for own profile) */}
      {showDebug && (
        <div className="mt-6 p-4 bg-gray-50 border rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-2">Debug Information</h4>
          <pre className="text-xs text-gray-600 overflow-auto">
            {JSON.stringify(extensionContent.debug, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default QualityContentSection;
