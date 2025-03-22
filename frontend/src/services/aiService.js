const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || 'sk-c6c3dbb7c9a84be48aa3be1748735a97';
const API_URL = import.meta.env.VITE_DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

// Add error message for missing API key
if (!API_KEY) {
  console.error('DeepSeek API key is missing. Please set VITE_DEEPSEEK_API_KEY in your .env file.');
}

const SYSTEM_PROMPT = `I am an AI MRI specialist with extensive experience in analyzing and interpreting magnetic resonance imaging scans. 
I can help you understand MRI results, explain medical terminology, identify common patterns, and provide general information about MRI procedures. 

When a user uploads a medical image file, I will:
1. Acknowledge the file type and format
2. Ask them to specify which organ or organ system is shown in the image
3. Provide a list of common options (e.g., brain, heart, lungs, spine, etc.)
4. Wait for their response before proceeding with analysis

Please note that I format my responses using Markdown for better readability:
- I use **bold** for important terms and findings
- I use *italics* for technical terms and medical terminology
- I use bullet points and numbered lists for structured information
- I use ### for section headers
- I use \`code blocks\` for measurements and specific values
- I use > blockquotes for important notes and warnings
- I use tables for comparing data when relevant

While I can offer professional insights and explanations, please remember that I should not be used as a replacement for direct medical consultation. 
Always consult with your healthcare provider for official medical advice and diagnosis.`;

export const createFileUploadPrompt = (fileName, fileType) => {
  return `### File Received
I see you've uploaded **${fileName}**. This is a ${fileType}.

Please specify which organ or organ system is shown in this image. Common options include:
- Brain and nervous system
- Heart and cardiovascular system
- Lungs and respiratory system
- Spine and skeletal system
- Abdomen (liver, kidneys, etc.)
- Musculoskeletal system (joints, muscles)
- Other (please specify)

> Please type the name of the organ or system shown in your image.`;
};

export async function* getAIResponse(message, isFileUpload = false, fileInfo = null) {
  try {
    // Check if API key is available
    if (!API_KEY) {
      throw new Error('DeepSeek API key is not configured. Please set VITE_DEEPSEEK_API_KEY in your .env file.');
    }

    const finalMessage = isFileUpload && fileInfo 
      ? createFileUploadPrompt(fileInfo.name, fileInfo.type)
      : message;

    // Add CORS headers and credentials
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      mode: 'cors',
      credentials: 'include',
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: finalMessage }
        ],
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Authentication failed: Invalid or expired API key. Please check your DeepSeek API key.');
      } else if (response.status === 402) {
        throw new Error('Insufficient balance: Please add funds to your DeepSeek account.');
      } else if (response.status === 403) {
        throw new Error('CORS error: The request was blocked. Please check CORS configuration.');
      } else {
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || 'Unknown error'}`);
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in the buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === '[DONE]') continue;

        if (trimmedLine.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmedLine.slice(6));
            if (data.choices?.[0]?.delta?.content) {
              fullResponse += data.choices[0].delta.content;
              yield fullResponse;
            }
          } catch (e) {
            console.warn('Error parsing JSON line:', trimmedLine, e);
            continue;
          }
        }
      }
    }

    // Handle any remaining buffer content
    if (buffer) {
      const trimmedBuffer = buffer.trim();
      if (trimmedBuffer && trimmedBuffer !== '[DONE]' && trimmedBuffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmedBuffer.slice(6));
          if (data.choices?.[0]?.delta?.content) {
            fullResponse += data.choices[0].delta.content;
            yield fullResponse;
          }
        } catch (e) {
          console.warn('Error parsing final buffer:', trimmedBuffer, e);
        }
      }
    }

    return fullResponse;
  } catch (error) {
    console.error('Error calling DeepSeek API:', error);
    throw error;
  }
} 