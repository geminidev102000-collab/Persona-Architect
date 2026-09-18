import React from 'react';
import { FileText, Download, Copy, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentViewerProps {
  content: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ content }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Master_Reference_Document.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold">
          <FileText size={18} />
          <span>Master Document Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
          >
            <Copy size={14} /> Copy
          </button>
          <button 
            onClick={handleDownload}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {content ? (
          <div className="prose prose-invert prose-slate max-w-none prose-headings:text-indigo-300 prose-a:text-indigo-400 prose-strong:text-indigo-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
            <RefreshCw size={48} className="opacity-20" />
            <p className="text-sm">The agent is compiling your document...</p>
            <p className="text-xs max-w-xs text-center">Chat with the agent or use the Live Interview feature to populate this document.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;