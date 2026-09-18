import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Alert, Badge, Button, Drawer, EmptyState, Input, Textarea } from './ui';
import type { BadgeVariant } from './ui';
import type { SupportMessage } from '../lib/database.types';

export function openSupportChat() {
  window.dispatchEvent(new CustomEvent('open-support-chat'));
}

const supportStatusPresentation: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  in_progress: { label: 'En revisión', variant: 'primary' },
  resolved: { label: 'Resuelto', variant: 'success' },
};

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const userId = user?.id;
  const userEmail = user?.email;

  const loadMessages = useCallback(async () => {
    if (!userId) return;

    setMessagesLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('support_messages')
        .select('*')
        .or(`user_id.eq.${userId},and(user_id.is.null,user_email.eq.${userEmail})`)
        .order('created_at', { ascending: true });

      if (loadError) {
        setError('No se pudieron cargar los mensajes. Inténtalo de nuevo.');
        return;
      }

      setMessages(data ?? []);
    } catch {
      setError('No se pudieron cargar los mensajes. Inténtalo de nuevo.');
    } finally {
      setMessagesLoading(false);
    }
  }, [userEmail, userId]);

  useEffect(() => {
    setMessages([]);
    setError('');
  }, [userEmail, userId]);

  useEffect(() => {
    if (isOpen) void loadMessages();
  }, [isOpen, loadMessages]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-support-chat', handler);
    return () => window.removeEventListener('open-support-chat', handler);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (!user && (!name.trim() || !email.trim())) {
      setError('Por favor, ingresa tu nombre y correo.');
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
        setError('Error al enviar el mensaje.');
      } else {
        setNewMessage('');
        if (user) {
          await loadMessages();
        } else {
          setMessages((currentMessages) => [...currentMessages, data.message]);
        }
      }
    } catch {
      setError('Error inesperado al enviar el mensaje.');
    } finally {
      setLoading(false);
    }
  };

  const supportForm = (
    <form onSubmit={handleSendMessage} className="w-full space-y-4">
      {!user && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tu nombre"
            maxLength={100}
            required
            disabled={loading}
          />
          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Tu correo"
            maxLength={320}
            required
            disabled={loading}
          />
        </div>
      )}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      <Textarea
        label="Mensaje"
        value={newMessage}
        onChange={(event) => setNewMessage(event.target.value)}
        placeholder="Escribe tu mensaje…"
        disabled={loading}
        maxLength={4000}
        showCount
        required
      />
      <Button
        type="submit"
        className="w-full"
        loading={loading}
        disabled={!newMessage.trim()}
        leadingIcon={<Send className="h-4 w-4" aria-hidden="true" />}
      >
        {loading ? 'Enviando…' : 'Enviar mensaje'}
      </Button>
    </form>
  );

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir soporte"
          className="fixed bottom-5 right-4 z-40 flex min-h-touch min-w-touch items-center justify-center rounded-af-full bg-academy-primary text-white shadow-af-elevated transition-colors hover:bg-academy-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <Drawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Soporte"
        side="right"
        className="sm:max-w-lg"
        footer={supportForm}
      >
        <p className="text-af-body-sm text-academy-text-muted">
          Envíanos un mensaje y podrás consultar aquí la respuesta.
        </p>

        <section aria-labelledby="support-history-title" className="mt-6">
          <h3 id="support-history-title" className="text-af-h4 text-academy-text">Historial de mensajes</h3>

          {messagesLoading ? (
            <div role="status" aria-live="polite" className="py-10 text-center text-af-body-sm text-academy-text-muted">
              Cargando mensajes…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<MessageCircle className="h-10 w-10" />}
              title="Todavía no hay mensajes"
              description="Envíanos un mensaje y podrás consultar aquí la respuesta."
            />
          ) : (
            <div className="mt-4 space-y-4">
              {messages.map((msg) => {
                const status = supportStatusPresentation[msg.status] ?? {
                  label: msg.status,
                  variant: 'neutral' as const,
                };

                return (
                  <article key={msg.id} className="rounded-af-md border border-academy-border bg-academy-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-academy-text">{user ? 'Tú' : msg.user_name}</p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-af-body-sm text-academy-text">{msg.message}</p>
                    <time dateTime={msg.created_at} className="mt-2 block text-af-label-sm text-academy-text-muted">
                      {new Date(msg.created_at).toLocaleString('es-ES')}
                    </time>

                    {msg.admin_response && (
                      <div className="mt-4 border-t border-academy-border pt-4">
                        <p className="text-af-label text-academy-text">Equipo de soporte</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-af-body-sm text-academy-text-muted">
                          {msg.admin_response}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </Drawer>
    </>
  );
}
