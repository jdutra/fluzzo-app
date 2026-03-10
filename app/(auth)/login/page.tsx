'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Mail } from 'lucide-react'

type LoginMode = 'password' | 'magic-link'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<LoginMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message
      )
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMagicLinkSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center font-bold text-white text-lg shadow-lg">
            F
          </div>
          <span className="font-bold text-2xl text-white tracking-tight">
            Fluzzo
          </span>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">
              Gestão de leads e financeiro
            </CardDescription>
          </CardHeader>

          <CardContent>
            {magicLinkSent ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Mail size={24} className="text-green-600" />
                </div>
                <p className="font-medium text-slate-800">Link enviado!</p>
                <p className="text-sm text-muted-foreground">
                  Verifique seu e-mail <strong>{email}</strong> e clique no link
                  para entrar.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMagicLinkSent(false)
                    setMode('password')
                  }}
                >
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <form
                onSubmit={
                  mode === 'password' ? handleEmailPassword : handleMagicLink
                }
                className="space-y-4"
              >
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle size={15} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    className="h-10"
                  />
                </div>

                {mode === 'password' && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="current-password"
                      className="h-10"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-teal-600 hover:bg-teal-700"
                  disabled={loading}
                >
                  {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
                  {mode === 'password' ? 'Entrar' : 'Enviar link mágico'}
                </Button>
              </form>
            )}
          </CardContent>

          {!magicLinkSent && (
            <CardFooter className="flex justify-center pt-0">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'password' ? 'magic-link' : 'password')
                  setError(null)
                }}
                className="text-xs text-muted-foreground hover:text-slate-700 underline underline-offset-4 transition-colors"
              >
                {mode === 'password'
                  ? 'Entrar com link mágico (sem senha)'
                  : 'Entrar com e-mail e senha'}
              </button>
            </CardFooter>
          )}
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Fluzzo · Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
