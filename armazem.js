// Onde os dados ficam guardados.
// Com SUPABASE_URL e SUPABASE_SERVICE_KEY: tabelas do Supabase (produção).
// Sem elas: um arquivo local dados-locais.json (só para testar no computador).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const TABELAS = { reunioes: 'reunioes', planos: 'formularios', jogos: 'jogos' }

function armazemSupabase(url, chave) {
    const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } })
    const falhou = (acao, error) => { throw new Error(`Supabase (${acao}): ${error.message}`) }
    return {
        nome: 'Supabase',
        async listar(c) {
            const { data, error } = await db.from(TABELAS[c]).select('id, secao, dados').order('atualizado_em', { ascending: false })
            if (error) falhou('listar', error)
            return data
        },
        async pegar(c, id) {
            const { data, error } = await db.from(TABELAS[c]).select('id, secao, dados').eq('id', id).maybeSingle()
            if (error) falhou('ler', error)
            return data
        },
        async gravar(c, id, secao, dados) {
            const { error } = await db.from(TABELAS[c]).upsert({ id, secao, dados, atualizado_em: new Date().toISOString() })
            if (error) falhou('gravar', error)
        },
        async apagar(c, id) {
            const { error } = await db.from(TABELAS[c]).delete().eq('id', id)
            if (error) falhou('apagar', error)
        }
    }
}

function armazemLocal(arquivo) {
    let mem = { reunioes: {}, planos: {}, jogos: {} }
    if (existsSync(arquivo)) mem = { ...mem, ...JSON.parse(readFileSync(arquivo, 'utf8')) }
    const salvar = () => writeFileSync(arquivo, JSON.stringify(mem))
    return {
        nome: 'arquivo local (teste)',
        async listar(c) { return Object.entries(mem[c]).map(([id, r]) => ({ id, ...r })) },
        async pegar(c, id) { const r = mem[c][id]; return r ? { id, ...JSON.parse(JSON.stringify(r)) } : null },
        async gravar(c, id, secao, dados) { mem[c][id] = { secao, dados: JSON.parse(JSON.stringify(dados)) }; salvar() },
        async apagar(c, id) { delete mem[c][id]; salvar() }
    }
}

export function criarArmazem() {
    const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_KEY
    if (url && chave) return armazemSupabase(url, chave)
    if (process.env.NODE_ENV === 'production') throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis do servidor.')
    console.warn('Sem SUPABASE_URL/SUPABASE_SERVICE_KEY: usando dados-locais.json (modo de teste).')
    return armazemLocal(process.env.ARQUIVO_LOCAL || 'dados-locais.json')
}
