
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Make sure the 'marked' library is available globally
declare const marked: {
  parse(markdown: string): string;
};

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const apiTemplates = [
  {
    id: 'api-1',
    name: 'Summarize Text',
    description: 'Condenses long text into key bullet points.',
    promptPrefix: 'Summarize the following text in five key bullet points: ',
    placeholder: 'Enter a long article or text to summarize...',
    endpoint: '/v1/cool-shot/text-prompt',
    type: 'text',
    model: 'gemini-2.5-flash'
  },
  {
    id: 'api-2',
    name: 'Universal Translator',
    description: 'Translates English to any specified language.',
    promptPrefix: 'Translate the following English text to ', // The language will be added from the prompt
    placeholder: 'Specify the language, then the text. E.g.,\nFrench: The book is on the table.\nJapanese: How are you?',
    endpoint: '/v1/cool-shot/text-prompt',
    type: 'text',
    model: 'gemini-2.5-flash'
  },
  {
    id: 'api-3',
    name: 'Image Generator',
    description: 'Creates a high-quality image from a text description.',
    promptPrefix: '', // The user prompt is used directly for image generation
    placeholder: 'A photorealistic image of a cat wearing a tiny top hat...',
    endpoint: '/v1/cool-shot/generate-image',
    type: 'image',
    model: 'imagen-3.0-generate-002'
  },
  {
    id: 'api-4',
    name: 'Video Generator',
    description: 'Creates a short video clip from a text description. (May take a few minutes)',
    promptPrefix: '',
    placeholder: 'A cinematic shot of a futuristic city at night, with flying cars...',
    endpoint: '/v1/cool-shot/generate-video',
    type: 'video',
    model: 'veo-2.0-generate-001'
  },
  {
    id: 'api-5',
    name: 'Image-to-Text Extractor',
    description: 'Describes an image or answers questions about it.',
    promptPrefix: '', // Will be handled in the prompt logic
    placeholder: 'Optional: Ask a question about the image (e.g., "What color is the car?"). Leave blank for a general description.',
    endpoint: '/v1/cool-shot/analyze-image',
    type: 'image-to-text',
    model: 'gemini-2.5-flash'
  },
  {
    id: 'api-6',
    name: 'Speech-to-Text Transcriber',
    description: 'Uses your microphone to transcribe spoken words into text.',
    promptPrefix: '',
    placeholder: 'Click "Start Listening" and begin speaking...',
    endpoint: 'n/a',
    type: 'audio',
    model: 'n/a (uses browser Web Speech API)'
  },
  {
    id: 'api-7',
    name: 'Text-to-Speech Converter',
    description: 'Converts written text into spoken words using a synthetic voice.',
    promptPrefix: '',
    placeholder: 'Enter text here and click "Speak Text" to hear it spoken aloud...',
    endpoint: 'n/a',
    type: 'audio',
    model: 'n/a (uses browser Web Speech API)'
  },
] as const;

type ApiOption = typeof apiTemplates[number];
type ApiKey = string;
type ApiStatus = 'idle' | 'checking' | 'live' | 'offline';

const generateCodeSnippet = (api: ApiOption | null) => {
  if (!api || api.endpoint === 'n/a') return 'This feature runs directly in the browser and does not have a server endpoint.';
  
  const apiUrl = `${window.location.origin}${api.endpoint}`;
  
  let bodyContent = `{\n  "model": "${api.model}",\n  "fullPrompt": "Your completed prompt..."\n}`;
  if (api.type === 'image') {
    bodyContent = `{\n  "model": "${api.model}",\n  "prompt": "Your creative prompt..."\n}`;
  } else if (api.type === 'video') {
    bodyContent = `{\n  "model": "${api.model}",\n  "prompt": "Your video prompt..."\n}`;
  } else if (api.type === 'image-to-text') {
    return `
// For image-to-text, you must send multipart/form-data.
// This is a simplified example using fetch with FormData.

const formData = new FormData();
formData.append('image', yourImageFile);
formData.append('model', '${api.model}');
formData.append('prompt', 'Optional: Your question about the image...');

fetch('${apiUrl}', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
    `.trim();
  }

  return `
fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${bodyContent})
})
.then(response => response.json())
.then(data => console.log(data));
  `.trim();
};

interface LiveRequest {
  model: string;
  prompt: string;
}

const App: React.FC = () => {
  const [selectedApi, setSelectedApi] = useState<ApiOption | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [liveRequestDetails, setLiveRequestDetails] = useState<LiveRequest | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const loadingMessageIntervalRef = useRef<number | null>(null);
  const videoPollingIntervalRef = useRef<number | null>(null);

  const [apiStatuses, setApiStatuses] = useState<Record<ApiKey, { status: ApiStatus; latency?: number }>>(() => {
    const initialStatuses = {} as Record<ApiKey, { status: ApiStatus; latency?: number }>;
    apiTemplates.forEach(api => {
      initialStatuses[api.id] = { status: 'idle' };
    });
    return initialStatuses;
  });
  
  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
        if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);
        if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);
    }
  }, []);

  const isSpeechToText = selectedApi?.type === 'audio' && selectedApi.name.includes('Speech-to-Text');
  const isTextToSpeech = selectedApi?.type === 'audio' && selectedApi.name.includes('Text-to-Speech');

  const handleSelectApi = (api: ApiOption) => {
    setSelectedApi(api);
    setPrompt('');
    setResult('');
    setError(null);
    setLiveRequestDetails(null);
    setImageFile(null);
    setImagePreview(null);
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleStatusCheck = (apiKey: ApiKey) => {
    setApiStatuses(prev => ({ ...prev, [apiKey]: { status: 'checking' } }));
    
    const startTime = Date.now();
    fetch(`/v1/cool-shot/health-check`)
      .then(res => {
        const latency = Date.now() - startTime;
        if (res.ok) {
          setApiStatuses(prev => ({...prev, [apiKey]: { status: 'live', latency }}));
        } else {
          setApiStatuses(prev => ({...prev, [apiKey]: { status: 'offline' }}));
        }
      })
      .catch(() => {
        setApiStatuses(prev => ({...prev, [apiKey]: { status: 'offline' }}));
      });
  };
  
  const handleCheckAllStatuses = () => {
    setIsCheckingAll(true);
    const apisToCheck = apiTemplates.filter(api => api.endpoint !== 'n/a');

    const checkingStatuses = apisToCheck.reduce((acc, api) => {
      acc[api.id] = { status: 'checking' };
      return acc;
    }, {} as Record<string, { status: ApiStatus; latency?: number }>);
    setApiStatuses(prev => ({ ...prev, ...checkingStatuses }));

    apisToCheck.forEach((api, index) => {
      setTimeout(() => {
        handleStatusCheck(api.id);
      }, index * 50);
    });

    const totalTime = (apisToCheck.length * 50) + 1200;
    setTimeout(() => {
      setIsCheckingAll(false);
    }, totalTime);
  };

  const handleTextToSpeech = () => {
    if (!('speechSynthesis' in window)) {
        setError('Sorry, your browser does not support text-to-speech.');
        return;
    }
    if (!prompt.trim()) {
        setError('Please enter some text to speak.');
        return;
    }
    setError(null);
    const utterance = new SpeechSynthesisUtterance(prompt);
    window.speechSynthesis.speak(utterance);
  };

  const handleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        setError('Sorry, your browser does not support speech recognition.');
        return;
    }

    if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
    } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.onerror = (event: any) => {
            setError(`Speech recognition error: ${event.error}`);
            setIsListening(false);
        };

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            setPrompt(prev => prev + finalTranscript + ' ');
        };
        
        recognitionRef.current = recognition;
        recognition.start();
    }
  };

  const pollVideoStatus = (operation: any) => {
    if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);

    videoPollingIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/v1/cool-shot/video-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation }),
        });
        const data = await res.json();

        if (data.status === 'done') {
          if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);
          if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);
          setResult(`<video controls autoplay loop muted class="generated-video" src="${data.videoUrl}" title="Generated video" />`);
          setIsLoading(false);
        } else if (data.status === 'failed') {
          if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);
          if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);
          setError(`Video generation failed: ${data.error}`);
          setIsLoading(false);
        } else {
          // It's still processing, the interval will continue
        }
      } catch (err) {
        if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);
        if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);
        setError(`Error checking video status: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    }, 10000); // Poll every 10 seconds
  };
  
  const handleGenerate = async () => {
    if (isTextToSpeech) { handleTextToSpeech(); return; }
    if (isSpeechToText) { handleSpeechRecognition(); return; }
    
    if (!selectedApi) { setError('Please select an API to call.'); return; }
    if (selectedApi.type !== 'image-to-text' && !prompt.trim()) { setError('Please enter some input for the API.'); return; }

    setIsLoading(true);
    setResult('');
    setError(null);
    if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);

    setLiveRequestDetails({
        model: selectedApi.model,
        prompt: selectedApi.promptPrefix ? `${selectedApi.promptPrefix}${prompt}` : prompt,
    });

    try {
        if (selectedApi.type === 'image-to-text') {
            if (!imageFile) { setError('Please upload an image to analyze.'); setIsLoading(false); return; }
            
            const formData = new FormData();
            formData.append('image', imageFile);
            formData.append('prompt', prompt);
            formData.append('model', selectedApi.model);

            const res = await fetch(selectedApi.endpoint, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to analyze image.');

            setResult(marked.parse(data.result));

        } else if (selectedApi.type === 'image') {
            const res = await fetch(selectedApi.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: selectedApi.model, prompt: prompt }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate image.');

            setResult(`<img src="${data.imageUrl}" alt="Generated image: ${prompt}" class="generated-image" />`);

        } else if (selectedApi.type === 'video') {
            const videoLoadingMessages = ["Warming up the video render farm...", "Compositing pixels into a masterpiece...", "This can take a minute or two...", "Finalizing the video stream...", "Almost there..."];
            let messageIndex = 0;
            
            const updateLoadingMessage = () => {
                const message = videoLoadingMessages[messageIndex];
                setResult(`<div class="loading-spinner" role="status"><div class="spinner"></div><p class="loading-message">${message}</p></div>`);
                messageIndex = (messageIndex + 1) % videoLoadingMessages.length;
            };

            updateLoadingMessage();
            loadingMessageIntervalRef.current = window.setInterval(updateLoadingMessage, 5000);
            
            const fullPrompt = `${selectedApi.promptPrefix}${prompt}`;
            setLiveRequestDetails(prev => prev ? { ...prev, prompt: fullPrompt } : null);

            const res = await fetch(selectedApi.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: selectedApi.model, prompt: fullPrompt }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start video generation.');

            pollVideoStatus(data.operation);

        } else { // Handle text-based APIs
            let fullPrompt = `${selectedApi.promptPrefix}${prompt}`;
            if (selectedApi.name.includes('Universal Translator')) {
                const parts = prompt.match(/^([a-zA-Z\s\-]+):\s*(.*)/s);
                if (parts && parts.length === 3) {
                    const language = parts[1].trim();
                    const textToTranslate = parts[2].trim();
                    fullPrompt = `${selectedApi.promptPrefix}${language}: ${textToTranslate}`;
                } else {
                    setError('Invalid format. Use "Language: Text to translate"'); setIsLoading(false); return;
                }
            }
            setLiveRequestDetails(prev => prev ? { ...prev, prompt: fullPrompt } : null);
            
            const res = await fetch(selectedApi.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: selectedApi.model, fullPrompt }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to get response.');

            setResult(marked.parse(data.result));
        }

    } catch (err) {
        if (loadingMessageIntervalRef.current) clearInterval(loadingMessageIntervalRef.current);
        if (videoPollingIntervalRef.current) clearInterval(videoPollingIntervalRef.current);
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Error from server: ${errorMessage}`);
    } finally {
      if (selectedApi?.type !== 'video') {
        setIsLoading(false);
      }
    }
  };

  const handleCopy = (textToCopy: string, type: 'url' | 'code') => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      if (type === 'url') {
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 2000);
      } else {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      }
    });
  };
  
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const isApiSelected = !!selectedApi;
  const currentStatus = selectedApi ? apiStatuses[selectedApi.id].status : 'idle';
  const codeSnippet = generateCodeSnippet(selectedApi);
  const apiUrl = selectedApi ? `${window.location.origin}${selectedApi.endpoint}` : '';
  
  return (
    <div className="container">
      <header>
        <h1>Cool Shot Systems API</h1>
        <p className="developer-credit">Developed by Heritage Oladoye</p>
        <p>A live, full-stack API powered by your own backend server and the Google Gemini models.</p>
      </header>
      
      <main>
        <section className="api-dashboard">
            <div className="dashboard-header">
                <div className="dashboard-title">
                    <h2>API Dashboard</h2>
                </div>
                <button onClick={handleCheckAllStatuses} className="check-all-btn" disabled={isCheckingAll}>
                    {isCheckingAll ? 'Checking...' : 'Check All Statuses'}
                </button>
            </div>
          
          <div className="api-list">
            {apiTemplates.map((api) => {
              const statusInfo = apiStatuses[api.id];
              const isBrowserApi = api.endpoint === 'n/a';
              return (
                <div 
                  key={api.id} 
                  className={`api-card ${selectedApi?.id === api.id ? 'selected' : ''}`}
                  onClick={() => handleSelectApi(api)}
                  tabIndex={0}
                  onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectApi(api)}
                >
                  <div className="api-card-header">
                    <h3>{api.name}</h3>
                    <span className={`api-type-badge type-${api.type}`}>{api.type}</span>
                  </div>
                  <p>{api.description}</p>
                  <div className="api-card-footer">
                     {!isBrowserApi ? (
                       <div className="api-status" aria-live="polite">
                          <span className={`status-indicator ${statusInfo.status}`}></span>
                          <span className="status-text">
                              {statusInfo.status === 'idle' && 'Status: Unknown'}
                              {statusInfo.status === 'checking' && 'Status: Checking...'}
                              {statusInfo.status === 'live' && `Status: Live (${statusInfo.latency}ms)`}
                              {statusInfo.status === 'offline' && 'Status: Offline'}
                          </span>
                       </div>
                     ) : (
                       <div className="api-status"><span className="status-text">Browser API</span></div>
                     )}
                     {!isBrowserApi && (
                       <button 
                          className="status-check-btn" 
                          onClick={(e) => { e.stopPropagation(); handleStatusCheck(api.id); }}
                          disabled={statusInfo.status === 'checking'}
                       >
                          {statusInfo.status === 'checking' ? '...' : 'Check'}
                       </button>
                     )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {isApiSelected && (
          <>
            <div className="input-section">
              {selectedApi.type === 'image-to-text' && (
                  <div className="image-uploader">
                      <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleImageChange} 
                          id="image-upload-input" 
                          aria-label="Upload an image"
                          disabled={isLoading}
                      />
                      <label htmlFor="image-upload-input" className="image-upload-label">
                          {imagePreview ? 'Change Image' : 'Select Image'}
                      </label>
                      {imagePreview && <img src={imagePreview} alt="Image preview" className="image-preview" />}
                  </div>
              )}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={selectedApi?.placeholder}
                aria-label="API input"
                disabled={isLoading || (currentStatus !== 'live' && selectedApi.endpoint !== 'n/a') || isListening}
              />
              <button 
                onClick={handleGenerate} 
                disabled={isLoading || (currentStatus !== 'live' && selectedApi.endpoint !== 'n/a') || (selectedApi.type === 'image-to-text' && !imageFile)}
                title={(currentStatus !== 'live' && selectedApi.endpoint !== 'n/a') ? 'API is not live. Check status.' : 'Call your custom API'}
                className={isListening ? 'listening' : ''}
              >
                {isLoading ? 'Calling API...' : isSpeechToText ? (isListening ? 'Stop Listening' : 'Start Listening') : isTextToSpeech ? 'Speak Text' : 'Call My API'}
              </button>
            </div>

            <section className="api-details-section">
              <h3>Your API Details for "{selectedApi.name}"</h3>
               <p className="note">
                <em>Note: This endpoint is now live and served by your backend on Vercel.</em>
              </p>
              {selectedApi.endpoint !== 'n/a' && (
                <>
                  <div className="api-detail">
                    <label htmlFor="apiUrl">API Endpoint URL</label>
                    <div className="input-with-button">
                      <input type="text" id="apiUrl" value={apiUrl} readOnly aria-label="API Endpoint URL"/>
                      <button className="copy-url-btn" onClick={() => handleCopy(apiUrl, 'url')}>
                        {urlCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div className="api-detail code-snippet-container">
                    <label>Example Code Snippet (JavaScript)</label>
                    <button onClick={() => handleCopy(codeSnippet, 'code')} className="copy-code-btn">
                      {codeCopied ? 'Copied!' : 'Copy'}
                    </button>
                    <pre className="code-snippet">
                      <code>{codeSnippet}</code>
                    </pre>
                  </div>
                </>
              )}
            </section>
            
            <section className="results-section">
              <h2>API Response</h2>
              <div className="result-container" aria-live="polite">
                {isLoading && !result && (
                  <div className="loading-spinner" role="status" aria-label="Loading response">
                    <div className="spinner"></div>
                  </div>
                )}
                {error && <p className="error-message" role="alert">{error}</p>}
                {result && <div dangerouslySetInnerHTML={{ __html: result }} />}
                {!isLoading && !error && !result && <p>Select an API and enter a prompt to see the response here...</p>}
              </div>
            </section>
            
            {liveRequestDetails && (
              <section className="live-request-section">
                <h2>Live Request Details</h2>
                <div className="request-details-container">
                    <div className="request-detail-item">
                        <strong>Model Used:</strong>
                        <span>{liveRequestDetails.model}</span>
                    </div>
                    <div className="request-detail-item prompt-item">
                        <strong>Full Request Prompt:</strong>
                        <pre><code>{liveRequestDetails.prompt}</code></pre>
                    </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <button className="support-fab" onClick={() => setIsModalOpen(true)} aria-label="Open support contact modal">?</button>
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Support & Contact</h2>
              <button className="close-modal-btn" onClick={() => setIsModalOpen(false)} aria-label="Close modal">&times;</button>
            </div>
            <div className="modal-body">
              <p>For help or questions, please contact Heritage Oladoye:</p>
              <ul>
                <li><a href="https://wa.me/2348075614248" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                <li><a href="https://t.me/username" target="_blank" rel="noopener noreferrer">Telegram</a></li>
                <li><a href="mailto:oladoyeheritage445@gmail.com">Email</a></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
