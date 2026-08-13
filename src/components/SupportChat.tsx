import { useState, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { SupportMessage } from '../lib/database.types';

export function openSupportChat() {
  window.dispatchEvent(new CustomEvent('open-support-chat'));
}

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    if (user && isOpen) {
      loadMessages();
    }
  }, [user, isOpen]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-support-chat', handler);
    return () => window.removeEventListener('open-support-chat', handler);
  }, []);

  const loadMessages = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('support_messages')
      .select('*')
      .or(`user_id.eq.${user.id},and(user_id.is.null,user_email.eq.${user.email})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (!user && (!name.trim() || !email.trim())) {
      setError('Por favor, ingresa tu nombre y correo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: sendError } = await supabase.functions.invoke<{
        message: SupportMessage;
      }>('send-support-message', {
        body: user
          ? { message: newMessage }
          : { name, email, message: newMessage },
      });

      if (sendError || !data?.message) {
        setError('Error al enviar el mensaje');
      } else {
        setNewMessage('');
        if (user) {
          await loadMessages();
        } else {
          setMessages((currentMessages) => [...currentMessages, data.message]);
        }
      }
    } catch {
      setError('Error inesperado al enviar el mensaje');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition z-40"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 flex flex-col max-h-[600px]">
          <div className="bg-blue-600 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Soporte</h3>
              <p className="text-xs text-blue-100">Estamos aquí para ayudarte</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-blue-700 rounded transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px]">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle size={48} className="mx-auto mb-2 text-gray-300" />
                <p>Envíanos un mensaje</p>
                <p className="text-sm">Te responderemos lo antes posible</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="space-y-2">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{msg.user_name}</p>
                    <p className="text-sm text-gray-700">{msg.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(msg.created_at).toLocaleString('es-ES')}
                    </p>
                  </div>

                  {msg.admin_response && (
                    <div className="bg-gray-100 rounded-lg p-3 ml-4">
                      <p className="text-sm font-semibold text-gray-900 mb-1">Equipo de Soporte</p>
                      <p className="text-sm text-gray-700">{msg.admin_response}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t">
            {!user && (
              <div className="space-y-2 mb-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={100}
                  required
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Tu correo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={320}
                  required
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-xs mb-2">
                {error}
              </div>
            )}

            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                maxLength={4000}
              />
              <button
                type="submit"
                disabled={loading || !newMessage.trim()}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
