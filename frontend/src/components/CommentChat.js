import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { commentsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function CommentChat({ taskId, field, anchorRect, onClose, onValueChange }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await commentsAPI.getList(taskId, field);
        if (alive) setComments(r.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [taskId, field]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments]);

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current && rootRef.current.contains(e.target)) return;
      onClose();
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const r = await commentsAPI.add(taskId, field, t);
      const added = r.data;
      setComments(prev => {
        const next = prev.concat([added]);
        next.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id - b.id);
        return next;
      });
      setText('');
      if (onValueChange) onValueChange(added.text);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }, [text, sending, taskId, field, onValueChange]);

  const remove = useCallback(async (c) => {
    try {
      await commentsAPI.remove(c.id);
      const remainder = comments.filter(x => x.id !== c.id);
      const latest = [...remainder].sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || '') || a.id - b.id
      ).pop();
      setComments(remainder);
      if (onValueChange) onValueChange(latest ? latest.text : null);
    } catch (e) {
      console.error(e);
    }
  }, [comments, onValueChange]);

  const width = 300;
  const height = Math.min(320, window.innerHeight - 24);
  const gapY = 4;
  const belowTop = anchorRect ? anchorRect.bottom + window.scrollY + gapY : 0;
  const aboveTop = anchorRect ? anchorRect.top + window.scrollY - gapY - height : 0;
  const overflowBottom = belowTop + height > window.innerHeight - 8;
  const overflowTop = aboveTop < 8;
  let top;
  if (!overflowBottom) {
    top = belowTop;
  } else {
    top = overflowTop ? Math.max(8, window.innerHeight - height - 8) : aboveTop;
  }
  let left = anchorRect ? anchorRect.left + window.scrollX : 0;
  const maxLeft = window.innerWidth - width - 12;
  if (left + width > window.innerWidth - 8) left = Math.max(8, Math.min(left, maxLeft));

  return ReactDOM.createPortal(
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        top,
        left,
        width,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.20)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        height,
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderBottom: '1px solid #eee',
        fontSize: 12, fontWeight: 600, color: '#333',
      }}>
        <span>Комментарии</span>
        <button
          onClick={onClose}
          title="Закрыть"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, color: '#888',
          }}
        >&times;</button>
      </div>

      <div ref={listRef} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {loading ? (
          <span style={{ fontSize: 12, color: '#999' }}>Загрузка…</span>
        ) : comments.length === 0 ? (
          <span style={{ fontSize: 12, color: '#999' }}>Комментариев пока нет</span>
        ) : comments.map(c => (
          <div key={c.id} style={{
            background: '#f4f6fb', borderRadius: 6, padding: '6px 8px',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1971c2' }}>{c.author_name}</span>
                <span style={{ fontSize: 10, color: '#aaa', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</span>
              </div>
              {isAdmin && (
                <button
                  title="Удалить комментарий"
                  onClick={() => remove(c)}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 13, lineHeight: 1, color: '#c00', padding: 0, flexShrink: 0,
                  }}
                >&times;</button>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>
              {c.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        borderTop: '1px solid #eee', padding: '6px 8px', display: 'flex', gap: 6,
      }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Введите комментарий…"
          autoFocus
          style={{
            flex: 1, border: '1px solid #ddd', borderRadius: 5, padding: '5px 8px',
            fontSize: 12, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            border: 'none', background: '#1971c2', color: '#fff', borderRadius: 5,
            padding: '0 12px', fontSize: 12, cursor: 'pointer',
            opacity: sending || !text.trim() ? 0.5 : 1,
          }}
        >Отправить</button>
      </div>
    </div>,
    document.body
  );
}