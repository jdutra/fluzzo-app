'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/use-toast'
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Loader2, ChevronRight, ArrowLeft, Users,
  UserCheck, Handshake, FolderKanban, Receipt, Eye,
} from 'lucide-react'
import {
  importClientes,
  importConsultores,
  importParceiros,
  importProjetos,
  importLancamentos,
  type ImportedCliente,
  type ImportedConsultor,
  type ImportedParceiro,
  type ImportedProjeto,
  type ImportedLancamento,
  type ImportResult,
} from '@/lib/actions/import'

// ─── Types ────────────────────────────────────────────────────

interface ParsedData {
  clientes: ImportedCliente[]
  consultores: ImportedConsultor[]
  parceiros: ImportedParceiro[]
  projetos: ImportedProjeto[]
  lancamentos: ImportedLancamento[]
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

const ENTITY_TABS = [
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'consultores', label: 'Consultores', icon: UserCheck },
  { key: 'parceiros', label: 'Parceiros', icon: Handshake },
  { key: 'projetos', label: 'Projetos', icon: FolderKanban },
  { key: 'lancamentos', label: 'Lançamentos', icon: Receipt },
] as const

// ─── SheetJS Parser ───────────────────────────────────────────

function toDateStr(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  return null
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') return parseFloat(val) || 0
  return 0
}

function toStr(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

async function parseWorkbook(file: File): Promise<ParsedData> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  function getSheet(name: string) {
    const key = wb.SheetNames.find(n => n.includes(name.split('-')[0].trim()))
    return key ? wb.Sheets[key] : null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sheetToAoa(ws: any): unknown[][] {
    if (!ws) return []
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: 'yyyy-mm-dd' }) as unknown[][]
  }

  // ─── Clientes (sheet "3 - Clientes") ──────────────────────
  // Header row: first row where col[1] = 'Tipo'
  const clientesSheet = getSheet('3')
  const clientesAoa = sheetToAoa(clientesSheet)
  let clientesHeaderIdx = clientesAoa.findIndex(r => r[1] === 'Tipo')
  const clientes: ImportedCliente[] = []
  if (clientesHeaderIdx >= 0) {
    for (let i = clientesHeaderIdx + 1; i < clientesAoa.length; i++) {
      const r = clientesAoa[i]
      if (!r[2]) break // Nome vazio = fim dos dados
      const tipo = toStr(r[1]) ?? 'Cliente'
      const nome = toStr(r[2])
      if (!nome) continue
      clientes.push({
        tipo,
        nome,
        contato: toStr(r[3]),
        data_inicio: toDateStr(r[4]),
        ano: r[5] ? parseInt(String(r[5])) || null : null,
        segmento_macro: toStr(r[6]),
        segmento: toStr(r[7]),
        estado: toStr(r[8]),
        porte: toStr(r[9]),
        indicador: toStr(r[10]),
      })
    }
  }

  // ─── Consultores (sheet "4 - Consultores") ─────────────────
  // Header row: first row where col[1] = 'Consultor'
  const consultoresSheet = getSheet('4')
  const consultoresAoa = sheetToAoa(consultoresSheet)
  const consultoresHeaderIdx = consultoresAoa.findIndex(r => r[1] === 'Consultor')
  const consultores: ImportedConsultor[] = []
  if (consultoresHeaderIdx >= 0) {
    for (let i = consultoresHeaderIdx + 1; i < consultoresAoa.length; i++) {
      const r = consultoresAoa[i]
      const nome = toStr(r[1])
      if (!nome) break
      consultores.push({
        nome,
        ativo: String(r[2]).toLowerCase().includes('sim'),
        observacoes: toStr(r[3]),
        pix: toStr(r[4]),
      })
    }
  }

  // ─── Parceiros (sheet "5 - Parceiros") ─────────────────────
  // Header row: first row where col[1] = 'Parceiro'
  const parceirosSheet = getSheet('5')
  const parceirosAoa = sheetToAoa(parceirosSheet)
  const parceirosHeaderIdx = parceirosAoa.findIndex(r => r[1] === 'Parceiro')
  const parceiros: ImportedParceiro[] = []
  if (parceirosHeaderIdx >= 0) {
    for (let i = parceirosHeaderIdx + 1; i < parceirosAoa.length; i++) {
      const r = parceirosAoa[i]
      const nome = toStr(r[1])
      if (!nome) continue
      if (nome === 'TOTAL' || nome.startsWith('Total')) continue
      parceiros.push({
        nome,
        area: toStr(r[2]),
        empresa: toStr(r[3]),
      })
    }
  }

  // ─── Projetos (sheet "6 - Projetos") ───────────────────────
  // Header row: first row where col[2] = 'Código'
  const projetosSheet = getSheet('6')
  const projetosAoa = sheetToAoa(projetosSheet)
  const projetosHeaderIdx = projetosAoa.findIndex(r => r[2] === 'Código')
  const projetos: ImportedProjeto[] = []
  if (projetosHeaderIdx >= 0) {
    for (let i = projetosHeaderIdx + 1; i < projetosAoa.length; i++) {
      const r = projetosAoa[i]
      const codigo = parseInt(String(r[2]))
      const clienteNome = toStr(r[1])
      if (!codigo || isNaN(codigo) || !clienteNome) continue
      projetos.push({
        cliente_nome: clienteNome,
        codigo,
        gp: toStr(r[3]),
        data_venda: toDateStr(r[4]),
        ano: r[5] ? parseInt(String(r[5])) || null : null,
        status: toStr(r[6]) ?? 'Ativo',
        ordem_compra: toStr(r[7]),
        receita: toNum(r[8]),
        faturado: toNum(r[9]),
      })
    }
  }

  // ─── Lançamentos (sheet "7 - Lançamentos") ─────────────────
  // Header row: first row where col[1] = 'Cód Proj.'
  const lancamentosSheet = getSheet('7')
  const lancamentosAoa = sheetToAoa(lancamentosSheet)
  const lancamentosHeaderIdx = lancamentosAoa.findIndex(r =>
    String(r[1] ?? '').includes('Cód') || String(r[1] ?? '').includes('Cod')
  )
  const lancamentos: ImportedLancamento[] = []
  if (lancamentosHeaderIdx >= 0) {
    let emptyRowCount = 0
    for (let i = lancamentosHeaderIdx + 1; i < lancamentosAoa.length; i++) {
      const r = lancamentosAoa[i]
      const codProjeto = parseInt(String(r[1] ?? ''))
      if (!codProjeto || isNaN(codProjeto)) {
        emptyRowCount++
        if (emptyRowCount > 5) break
        continue
      }
      emptyRowCount = 0
      const valor = toNum(r[7])
      if (valor === 0) continue

      lancamentos.push({
        cod_projeto: codProjeto,
        cliente_nome: toStr(r[2]) ?? '',
        classificacao: toStr(r[4]) ?? 'Geral',
        parcela: r[5] ? parseInt(String(r[5])) || null : null,
        ordem: parseInt(String(r[6])) || 0,
        valor,
        previsao_faturamento: toDateStr(r[8]),
        data_faturamento: toDateStr(r[9]),
        previsao_pagamento: toDateStr(r[10]),
        data_pagamento: toDateStr(r[11]),
      })
    }
  }

  return { clientes, consultores, parceiros, projetos, lancamentos }
}

// ─── Page Component ───────────────────────────────────────────

export default function ImportarPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [activeTab, setActiveTab] = useState<string>('clientes')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set(['clientes', 'consultores', 'parceiros', 'projetos', 'lancamentos'])
  )

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({ title: 'Formato inválido.', description: 'Envie um arquivo .xlsx ou .xls', variant: 'destructive' })
      return
    }
    setFileName(file.name)
    setParsing(true)
    try {
      const data = await parseWorkbook(file)
      setParsed(data)
      setStep('preview')
    } catch (e: unknown) {
      toast({
        title: 'Erro ao ler planilha.',
        description: e instanceof Error ? e.message : 'Verifique se a planilha segue o template.',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    setStep('importing')
    const res: ImportResult[] = []

    if (selectedEntities.has('clientes') && parsed.clientes.length > 0) {
      res.push(await importClientes(parsed.clientes))
    }
    if (selectedEntities.has('consultores') && parsed.consultores.length > 0) {
      res.push(await importConsultores(parsed.consultores))
    }
    if (selectedEntities.has('parceiros') && parsed.parceiros.length > 0) {
      res.push(await importParceiros(parsed.parceiros))
    }
    if (selectedEntities.has('projetos') && parsed.projetos.length > 0) {
      res.push(await importProjetos(parsed.projetos))
    }
    if (selectedEntities.has('lancamentos') && parsed.lancamentos.length > 0) {
      res.push(await importLancamentos(parsed.lancamentos))
    }

    setResults(res)
    setImporting(false)
    setStep('done')
  }

  function toggleEntity(key: string) {
    setSelectedEntities(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function reset() {
    setStep('upload')
    setParsed(null)
    setFileName('')
    setResults([])
    setSelectedEntities(new Set(['clientes', 'consultores', 'parceiros', 'projetos', 'lancamentos']))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const totalRows = parsed
    ? Object.values(parsed).reduce((s, arr) => s + arr.length, 0)
    : 0

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar Planilha</h1>
        <p className="text-sm text-slate-500 mt-1">
          Importe dados históricos da planilha DRE Fluzzo (clientes, consultores, parceiros, projetos e lançamentos).
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'preview', 'done'] as const).map((s, idx) => {
          const labels = { upload: '1. Selecionar arquivo', preview: '2. Revisar dados', done: '3. Concluído' }
          const active = step === s || (step === 'importing' && s === 'preview')
          const done = (step === 'preview' && idx === 0) ||
            (step === 'importing' && idx <= 1) ||
            (step === 'done' && idx <= 2)
          return (
            <span key={s} className="flex items-center gap-1">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                active ? 'bg-teal-600 text-white' :
                done ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-400'
              }`}>
                {labels[s]}
              </span>
              {idx < 2 && <ChevronRight size={14} className="text-slate-300" />}
            </span>
          )
        })}
      </div>

      {/* ── STEP 1: Upload ───────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all p-14
              ${dragOver
                ? 'border-teal-400 bg-teal-50'
                : 'border-slate-300 bg-white hover:border-teal-300 hover:bg-slate-50'
              }`}
          >
            {parsing ? (
              <Loader2 size={36} className="text-teal-500 animate-spin" />
            ) : (
              <UploadCloud size={40} className={dragOver ? 'text-teal-500' : 'text-slate-300'} />
            )}
            <div className="text-center">
              <p className="font-medium text-slate-700">
                {parsing ? 'Lendo planilha…' : 'Arraste a planilha ou clique para selecionar'}
              </p>
              <p className="text-sm text-slate-400 mt-1">Formato: .xlsx — Template DRE Fluzzo</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>

          {/* Template info */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 space-y-1">
                  <p className="font-medium">Sobre o template</p>
                  <p>A planilha deve seguir o modelo <strong>DRE Fluzzo v.01</strong> com as abas: Parâmetros, Metas, Clientes, Consultores, Parceiros, Projetos, Lançamentos, Fluxo Previsto e Extrato.</p>
                  <p>Registros já existentes no sistema (mesmo nome/código) serão <strong>ignorados</strong> — não haverá duplicação.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Preview ──────────────────────────────────── */}
      {(step === 'preview' || step === 'importing') && parsed && (
        <div className="space-y-4">
          {/* File info + entity selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-green-600" />
              <span className="font-medium text-slate-700">{fileName}</span>
              <Badge className="bg-green-100 text-green-700">{totalRows} registros encontrados</Badge>
            </div>
            <button onClick={reset} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <ArrowLeft size={12} /> Trocar arquivo
            </button>
          </div>

          {/* Entity selection cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {ENTITY_TABS.map(({ key, label, icon: Icon }) => {
              const count = parsed[key as keyof ParsedData]?.length ?? 0
              const selected = selectedEntities.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleEntity(key)}
                  disabled={count === 0}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    count === 0
                      ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      : selected
                      ? 'border-teal-400 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  <span className={`text-xs font-normal ${count === 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                    {count} registros
                  </span>
                  {selected && count > 0 && (
                    <CheckCircle2 size={12} className="text-teal-500" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Data preview tabs */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {ENTITY_TABS.filter(t => (parsed[t.key as keyof ParsedData]?.length ?? 0) > 0).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Eye size={11} />
                    {label} ({parsed[key as keyof ParsedData]?.length ?? 0})
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <PreviewTable data={parsed} activeTab={activeTab} />
              </div>
            </CardContent>
          </Card>

          {/* Import button */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-slate-500">
              {selectedEntities.size > 0
                ? `${Array.from(selectedEntities).filter(k => (parsed[k as keyof ParsedData]?.length ?? 0) > 0).length} entidades selecionadas para importação`
                : 'Nenhuma entidade selecionada'}
            </p>
            <Button
              onClick={handleImport}
              disabled={importing || selectedEntities.size === 0}
              className="bg-teal-600 hover:bg-teal-700 gap-2"
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              {importing ? 'Importando…' : 'Importar dados'}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ─────────────────────────────────────── */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle2 size={24} className="text-green-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Importação concluída!</p>
              <p className="text-sm text-green-700 mt-0.5">
                Confira os resultados abaixo e acesse as seções do sistema para verificar os dados.
              </p>
            </div>
          </div>

          {/* Results per entity */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((r) => (
              <Card key={r.entity} className={r.errors.length > 0 ? 'border-orange-200' : 'border-green-200'}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-slate-800">{r.entity}</p>
                    {r.errors.length > 0
                      ? <AlertTriangle size={16} className="text-orange-500" />
                      : <CheckCircle2 size={16} className="text-green-500" />
                    }
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Importados:</span>
                      <span className="font-medium text-green-700">{r.imported}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ignorados (já existem):</span>
                      <span className="font-medium text-slate-500">{r.skipped}</span>
                    </div>
                    {r.errors.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-orange-100">
                        <p className="text-xs text-orange-600 font-medium mb-1">Erros ({r.errors.length}):</p>
                        <div className="max-h-20 overflow-y-auto space-y-0.5">
                          {r.errors.map((e, i) => (
                            <p key={i} className="text-xs text-orange-700">{e}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Total summary */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-sm">
              <span className="text-slate-500">Total importado: </span>
              <span className="font-bold text-slate-800">
                {results.reduce((s, r) => s + r.imported, 0)} registros
              </span>
              <span className="text-slate-400 ml-2">
                ({results.reduce((s, r) => s + r.skipped, 0)} já existiam)
              </span>
            </div>
            <Button onClick={reset} variant="outline" className="gap-2">
              <UploadCloud size={14} /> Nova importação
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Preview Table Component ──────────────────────────────────

function PreviewTable({ data, activeTab }: { data: ParsedData; activeTab: string }) {
  if (activeTab === 'clientes') {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {['Tipo', 'Nome', 'Estado', 'Porte', 'Segmento', 'Data início'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.clientes.map((c, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 text-slate-500">{c.tipo}</td>
              <td className="px-3 py-1.5 font-medium">{c.nome}</td>
              <td className="px-3 py-1.5">{c.estado ?? '—'}</td>
              <td className="px-3 py-1.5">{c.porte ?? '—'}</td>
              <td className="px-3 py-1.5">{c.segmento_macro ?? '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{c.data_inicio ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (activeTab === 'consultores') {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {['Nome', 'Ativo', 'Observações', 'Pix'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.consultores.map((c, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-medium">{c.nome}</td>
              <td className="px-3 py-1.5">
                <Badge className={c.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                  {c.ativo ? 'Sim' : 'Não'}
                </Badge>
              </td>
              <td className="px-3 py-1.5 text-slate-500">{c.observacoes ?? '—'}</td>
              <td className="px-3 py-1.5">{c.pix ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (activeTab === 'parceiros') {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {['Nome', 'Área de atuação', 'Empresa'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.parceiros.map((p, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-medium">{p.nome}</td>
              <td className="px-3 py-1.5 text-slate-500">{p.area ?? '—'}</td>
              <td className="px-3 py-1.5">{p.empresa ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (activeTab === 'projetos') {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {['Cód.', 'Cliente', 'GP', 'Data venda', 'Receita', 'Status'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.projetos.map((p, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-mono">#{p.codigo}</td>
              <td className="px-3 py-1.5 font-medium">{p.cliente_nome}</td>
              <td className="px-3 py-1.5">{p.gp ?? '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{p.data_venda ?? '—'}</td>
              <td className="px-3 py-1.5">R$ {p.receita?.toLocaleString('pt-BR')}</td>
              <td className="px-3 py-1.5">{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (activeTab === 'lancamentos') {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {['Projeto', 'Cliente', 'Classificação', 'Parcela', 'Valor', 'Prev. pagamento'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.lancamentos.slice(0, 100).map((l, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-mono">#{l.cod_projeto}</td>
              <td className="px-3 py-1.5">{l.cliente_nome}</td>
              <td className="px-3 py-1.5">{l.classificacao}</td>
              <td className="px-3 py-1.5">{l.parcela ?? '—'}</td>
              <td className="px-3 py-1.5 font-medium">R$ {l.valor?.toLocaleString('pt-BR')}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{l.previsao_pagamento ?? '—'}</td>
            </tr>
          ))}
          {data.lancamentos.length > 100 && (
            <tr>
              <td colSpan={6} className="px-3 py-2 text-center text-slate-400">
                … e mais {data.lancamentos.length - 100} lançamentos
              </td>
            </tr>
          )}
        </tbody>
      </table>
    )
  }

  return null
}
