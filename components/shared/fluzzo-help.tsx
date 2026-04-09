'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, User, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Sou o assistente do Fluzzo. Pode me perguntar sobre qualquer funcionalidade do sistema — leads, projetos, lançamentos, clientes e muito mais.',
}

export function FluzzoHelp() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll automático para o fim
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Foca o input ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    const history = [...messages.filter((m) => m.id !== 'welcome'), userMsg]
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Placeholder para a resposta em streaming
    const assistantId = (Date.now() + 1).toString()
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Erro na resposta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m)
        )
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Desculpe, ocorreu um erro. Tente novamente.' }
            : m
        )
      )
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function reset() {
    setMessages([WELCOME])
    setInput('')
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajuda Fluzzo"
        className={`
          fixed bottom-6 right-6 z-50
          w-13 h-13 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-200
          ${open
            ? 'bg-slate-700 hover:bg-slate-800'
            : 'bg-teal-600 hover:bg-teal-700'
          }
        `}
        style={{ width: 52, height: 52 }}
      >
        {open
          ? <X size={20} className="text-white" />
          : <MessageCircle size={22} className="text-white" />
        }
      </button>

      {/* Janela de chat */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
          style={{ height: 480 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-teal-600 text-white">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <span className="font-semibold text-sm">Ajuda Fluzzo</span>
              <span className="text-[10px] bg-teal-500 px-1.5 py-0.5 rounded-full font-medium">IA</span>
            </div>
            <button
              onClick={reset}
              title="Nova conversa"
              className="text-teal-200 hover:text-white transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`
                  flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5
                  ${msg.role === 'user' ? 'bg-slate-200' : 'bg-teal-100'}
                `}>
                  {msg.role === 'user'
                    ? <User size={13} className="text-slate-600" />
                    : <Bot size={13} className="text-teal-600" />
                  }
                </div>

                {/* Bolha */}
                <div className={`
                  max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-teal-600 text-white rounded-tr-sm'
                    : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm'
                  }
                `}>
                  {msg.content === '' && msg.role === 'assistant' ? (
                    <span className="flex gap-1 items-center py-0.5">
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-slate-200 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua dúvida…"
              disabled={loading}
              className="flex-1 text-sm bg-slate-100 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50 placeholder:text-slate-400"
            />
            <Button
              size="icon"
              disabled={!input.trim() || loading}
              onClick={sendMessage}
              className="rounded-full w-9 h-9 bg-teal-600 hover:bg-teal-700 shrink-0"
            >
              {loading
                ? <Loader2 size={15} className="animate-spin" />
                : <Send size={15} />
              }
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
