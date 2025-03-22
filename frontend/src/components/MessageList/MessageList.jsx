import './MessageList.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ResultViewer from '../ResultViewer/ResultViewer'

const FileIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V9M13 2L20 9M13 2V8C13 8.55228 13.4477 9 14 9H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const MessageList = ({ messages, isExpanded, isLoading, currentResponse }) => {
  return (
    <div className={`messages-container ${isExpanded ? 'expanded' : ''}`}>
      {messages.map((message, index) => (
        <div 
          key={index} 
          className={`message ${message.sender} ${message.isError ? 'error' : ''}`}
        >
          {message.sender === 'user' ? (
            <>
              <div className="message-text">{message.text}</div>
              {message.file && (
                <div className="file-attachment">
                  <FileIcon />
                  <div className="file-info">
                    <span className="file-name">{message.file.name}</span>
                    <span className="file-size">({Math.round(message.file.size / 1024)} KB)</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({node, ...props}) => <p className="markdown-p" {...props} />,
                  h3: ({node, ...props}) => <h3 className="markdown-h3" {...props} />,
                  ul: ({node, ...props}) => <ul className="markdown-ul" {...props} />,
                  ol: ({node, ...props}) => <ol className="markdown-ol" {...props} />,
                  li: ({node, ...props}) => <li className="markdown-li" {...props} />,
                  blockquote: ({node, ...props}) => <blockquote className="markdown-blockquote" {...props} />,
                  code: ({node, ...props}) => <code className="markdown-code" {...props} />,
                  table: ({node, ...props}) => <table className="markdown-table" {...props} />
                }}
              >
                {message.text}
              </ReactMarkdown>
              {message.segmentation && message.output && (
                <div className="result-viewer-container">
                  {console.log('Rendering ResultViewer with data:', {
                    segmentation: message.segmentation,
                    output: message.output
                  })}
                  <ResultViewer 
                    segmentationData={message.segmentation} 
                    outputData={message.output} 
                  />
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {(isLoading || currentResponse) && (
        <div className={`message ai ${!currentResponse ? 'loading' : ''}`}>
          {currentResponse ? (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({node, ...props}) => <p className="markdown-p" {...props} />,
                h3: ({node, ...props}) => <h3 className="markdown-h3" {...props} />,
                ul: ({node, ...props}) => <ul className="markdown-ul" {...props} />,
                ol: ({node, ...props}) => <ol className="markdown-ol" {...props} />,
                li: ({node, ...props}) => <li className="markdown-li" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="markdown-blockquote" {...props} />,
                code: ({node, ...props}) => <code className="markdown-code" {...props} />,
                table: ({node, ...props}) => <table className="markdown-table" {...props} />
              }}
            >
              {currentResponse}
            </ReactMarkdown>
          ) : (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MessageList 