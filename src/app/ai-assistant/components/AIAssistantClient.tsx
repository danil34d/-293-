'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Send, Loader2, Trash2, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Chat, Message } from '@/types/ai-assistant';
import ExportChatButton from './ExportChatButton';
import { SuggestedPrompts } from './AIChatV2Extras';

export function AIAssistantClient() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchChats(); }, []);
  useEffect(() => { if (activeChat) fetchMessages(activeChat); }, [activeChat]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function fetchChats() {
    const res = await fetch('/api/ai-assistant/chats');
    const data = await res.json();
    setChats(data.chats || []);
    if (!activeChat && data.chats.length > 0) setActiveChat(data.chats[0].id);
  }

  async function fetchMessages(chatId: string) {
    const res = await fetch(`/api/ai-assistant/chats/${chatId}/messages`);
    const data = await res.json();
    setMessages(data.messages || []);
  }

  async function createNewChat() {
    const res = await fetch('/api/ai-assistant/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Новый чат' }),
    });
    const data = await res.json();
    setChats([data.chat, ...chats]);
    setActiveChat(data.chat.id);
  }

  async function deleteChat(chatId: string) {
    if (!confirm('Удалить чат?')) return;
    await fetch(`/api/ai-assistant/chats/${chatId}`, { method: 'DELETE' });
    setChats(chats.filter(c => c.id !== chatId));
    if (activeChat === chatId) setActiveChat(null);
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    const tempMsg: Message = {
      id: `temp_${Date.now()}`,
      chat_id: activeChat,
      role: 'user',
      content: userMessage,
      created_at: Date.now(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch(`/api/ai-assistant/chats/${activeChat}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMessage }),
      });
      const data = await res.json();

      // Filter out undefined values before adding to messages
      if (data.userMessage && data.assistantMessage) {
        setMessages(prev => [...prev.filter(m => m.id !== tempMsg.id), data.userMessage, data.assistantMessage]);
        fetchChats();
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (error: any) {
      setMessages(prev => [...prev.filter(m => m.id !== tempMsg.id), {
        id: `error_${Date.now()}`,
        chat_id: activeChat,
        role: 'assistant',
        content: `**Ошибка:** ${error.message}`,
        created_at: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="ai-assistant-layout">
      <div className="chat-sidebar">
        <button onClick={createNewChat} className="new-chat-button">
          <Plus size={20} /> Новый чат
        </button>
        <div className="chat-list">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${activeChat === chat.id ? 'active' : ''}`}
              onClick={() => setActiveChat(chat.id)}
            >
              <div className="chat-item-content">
                <div className="message-count-badge">{chat.message_count || 0}</div>
                <span className="chat-title">{chat.title}</span>
              </div>
              <button className="delete-chat-btn" onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-window">
        {!activeChat ? (
          <div className="chat-window-empty">
            <MessageSquare size={64} />
            <p>Выберите чат или создайте новый</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <h3>{chats.find(c => c.id === activeChat)?.title || 'Чат'}</h3>
              <ExportChatButton
                chatId={activeChat}
                chatTitle={chats.find(c => c.id === activeChat)?.title || 'chat'}
              />
            </div>
            <div className="messages-container">
              {messages.filter(msg => msg && msg.role).map((msg, i) => (
                <div key={msg.id || i} className={`message ${msg.role}`}>
                  <div className="message-avatar">{msg.role === 'user' ? 'Вы' : 'AI'}</div>
                  <div className="message-content">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-avatar">AI</div>
                  <div className="message-content"><Loader2 className="spinner" size={20} /> Думаю...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Phase 37 / V2-#24: Suggested prompts для пустого чата */}
            <SuggestedPrompts
              visible={!isLoading && messages.filter(m => m && m.role).length === 0}
              onSelect={(prompt) => {
                setInput(prompt);
                // Лёгкий UX: фокус на input, чтобы пользователь видел что добавилось
                window.setTimeout(() => {
                  const el = document.querySelector<HTMLInputElement>('.chat-input-container input');
                  el?.focus();
                }, 0);
              }}
            />
            <div className="chat-input-container">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendMessage()}
                placeholder="Напишите запрос..."
                disabled={isLoading}
              />
              <button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
