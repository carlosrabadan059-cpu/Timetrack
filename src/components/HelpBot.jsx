import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, Loader, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import './HelpBot.css';

function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length) {
      elements.push(<ul key={key++}>{listItems}</ul>);
      listItems = [];
    }
  };

  const parseLine = (line) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(<li key={key++}>{parseLine(trimmed.replace(/^[-*]\s+/, ''))}</li>);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(<li key={key++}>{parseLine(trimmed.replace(/^\d+\.\s+/, ''))}</li>);
    } else {
      flushList();
      if (trimmed) elements.push(<p key={key++}>{parseLine(trimmed)}</p>);
    }
  }
  flushList();
  return <div className="helpbot-md">{elements}</div>;
}

const SUGGESTIONS = [
  '¿Cómo ficho la entrada?',
  '¿Cómo solicito una corrección?',
  '¿Cómo exporto mis fichajes?',
  '¿Qué es una incidencia?',
];

export default function HelpBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');

    const userMsg = { role: 'user', content: msg };
    setHistory(h => [...h, userMsg]);
    setLoading(true);

    try {
      const res = await api.post('/api/help/chat', {
        message: msg,
        history: history.slice(-10),
        page: window.location.pathname,
      });
      setHistory(h => [...h, { role: 'assistant', content: res.data.answer }]);
    } catch (err) {
      setError(err?.message ?? 'Error al contactar con el bot');
      setHistory(h => h.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        className={`helpbot-fab ${open ? 'helpbot-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Ayuda"
        title="Ayuda"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="helpbot-panel">
          <div className="helpbot-header">
            <div className="helpbot-header-info">
              <div className="helpbot-avatar"><Bot size={16} /></div>
              <div>
                <div className="helpbot-title">Asistente TimeTrack</div>
                <div className="helpbot-subtitle">Pregúntame cómo usar la app</div>
              </div>
            </div>
            <button className="helpbot-close" onClick={() => setOpen(false)}>
              <ChevronDown size={18} />
            </button>
          </div>

          <div className="helpbot-messages">
            {history.length === 0 && (
              <div className="helpbot-empty">
                <Bot size={32} className="helpbot-empty-icon" />
                <p>Hola, soy tu asistente de ayuda.<br />¿En qué puedo ayudarte?</p>
                <div className="helpbot-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="helpbot-suggestion" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((msg, i) => (
              <div key={i} className={`helpbot-msg helpbot-msg--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="helpbot-msg-avatar"><Bot size={12} /></div>
                )}
                <div className="helpbot-msg-bubble">
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="helpbot-msg helpbot-msg--assistant">
                <div className="helpbot-msg-avatar"><Bot size={12} /></div>
                <div className="helpbot-msg-bubble helpbot-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {error && (
              <div className="helpbot-error">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="helpbot-input-row">
            <textarea
              ref={inputRef}
              className="helpbot-input"
              placeholder="Escribe tu pregunta..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={loading}
            />
            <button
              className="helpbot-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              aria-label="Enviar"
            >
              {loading ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
