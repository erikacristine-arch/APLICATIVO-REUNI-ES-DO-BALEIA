// Reuniões do Baleia — servidor (Node.js + Hono + Supabase)
// Entrega o app (public/index.html) e guarda reuniões, pontuação e banco de jogos no Supabase.
// O conteúdo das reuniões chega embaralhado (criptografado) pelo app; aqui só se guarda
// e se confere a palavra-código antes de gravar ou apagar.
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { createHash, createDecipheriv } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { criarArmazem } from './armazem.js'

const CONF = JSON.parse(readFileSync(new URL('./codigo-fonte/conferencia-codigos.json', import.meta.url), 'utf8'))
const VER = CONF.ver, MVER = CONF.mver
const COLECOES = new Set(['reunioes', 'planos', 'jogos', 'seguranca', 'base'])
const armazem = criarArmazem()
const app = new Hono()

// Gravações só da própria página (mesma origem), como no IFPlay.
app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET') {
        const origem = c.req.header('origin')
        if (origem) {
            let o
            try { o = new URL(origem) } catch { return c.json({ erro: 'Origem inválida.' }, 403) }
            if (o.host !== new URL(c.req.url).host && o.host !== c.req.header('host')) return c.json({ erro: 'Origem não permitida.' }, 403)
        }
    }
    await next()
})

// ---------- Regras (as mesmas do Code.gs do Google) ----------

function confere(secao, prova) {
    const esperado = VER[secao]
    if (!esperado) throw new Error('codigo: seção inválida')
    const p = String(prova || '')
    if (!/^[0-9a-f]{64}$/.test(p)) throw new Error('codigo: palavra-código ausente')
    if (createHash('sha256').update(Buffer.from(p, 'hex')).digest('hex') !== esperado) throw new Error('codigo: palavra-código não confere')
}

// Palavra da diretoria: só ela grava na base compartilhada do plano de segurança
// (locais salvos, delegacias/hospitais e nomes da diretoria).
function confereDiretoria(prova) {
    const p = String(prova || '')
    if (!MVER || !/^[0-9a-f]{64}$/.test(p)) throw new Error('codigo: palavra da diretoria ausente')
    if (createHash('sha256').update(Buffer.from(p, 'hex')).digest('hex') !== MVER) throw new Error('codigo: palavra da diretoria não confere')
}
const ID_BASE = /^(local|apoio|config):[a-z0-9_:-]{1,140}$/
// Blocos de Aprendizagem (texto dos manuais da UEB): ficam na base com id 'prog:<ramo>',
// fora da leitura pública; só saem por apiProgressao com a palavra-código da seção.
const PRIVADO_BASE = id => String(id).startsWith('prog:')
function ramoDaSecao(secao) {
    const s = String(secao || '')
    if (s.startsWith('Ninhada')) return 'filhotes'
    if (s.startsWith('Alcateia')) return 'lobinho'
    if (s.startsWith('Tropa Escoteira')) return 'escoteiro'
    if (s.startsWith('Tropa Sênior')) return 'senior'
    if (s.startsWith('Clã')) return 'pioneiro'
    return null
}
const RAMOS = new Set(['filhotes', 'lobinho', 'escoteiro', 'senior', 'pioneiro'])
// O texto vem embaralhado no repositório (progressao.enc, AES-256-GCM + gzip); a chave fica só
// na variável PROG_CHAVE do Railway. Sem a chave, cai para a base ('prog:<ramo>').
let PROG = null
try {
    const chave = process.env.PROG_CHAVE
    if (chave && existsSync(new URL('./progressao.enc', import.meta.url))) {
        const b = readFileSync(new URL('./progressao.enc', import.meta.url))
        const d = createDecipheriv('aes-256-gcm', Buffer.from(chave, 'base64'), b.subarray(0, 12))
        d.setAuthTag(b.subarray(12, 28))
        PROG = JSON.parse(gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()])).toString('utf8'))
        console.log('Progressão carregada:', Object.keys(PROG).join(', '))
    }
} catch (e) { console.error('Progressão: não consegui abrir progressao.enc', e.message) }

function colecao(c) {
    if (!COLECOES.has(c)) throw new Error('coleção inválida')
    return c
}

// Uma gravação por vez em cada registro (evita que dois chefes se atropelem).
const filas = new Map()
function emFila(chave, fn) {
    const anterior = filas.get(chave) || Promise.resolve()
    const atual = anterior.catch(() => {}).then(fn)
    filas.set(chave, atual)
    atual.finally(() => { if (filas.get(chave) === atual) filas.delete(chave) }).catch(() => {})
    return atual
}

const api = {
    async apiList(c) {
        const linhas = await armazem.listar(colecao(c))
        // Planos de segurança: a lista leva só o resumo (embaralhado); o plano completo vem pelo apiGet.
        if (c === 'seguranca') return linhas.map(r => ({ id: r.id, secao: r.secao, r: r.dados && r.dados.r }))
        if (c === 'base') return linhas.filter(r => !PRIVADO_BASE(r.id)).map(r => ({ ...r.dados, id: r.id, secao: r.secao }))
        return linhas.map(r => ({ ...r.dados, id: r.id, secao: r.secao }))
    },
    async apiCount(c) {
        const linhas = await armazem.listar(colecao(c))
        const n = {}
        for (const r of linhas) n[r.secao] = (n[r.secao] || 0) + 1
        return n
    },
    async apiGet(c, id) {
        if (c === 'base' && PRIVADO_BASE(id)) return null
        const r = await armazem.pegar(colecao(c), String(id))
        return r ? { ...r.dados, secao: r.secao } : null
    },
    async apiSet(c, id, json, prova) {
        colecao(c)
        if (c === 'base') throw new Error('coleção inválida')
        const o = JSON.parse(json)
        const secao = String(o.secao || '')
        confere(secao, prova)
        return emFila(c + ':' + id, async () => {
            const r = await armazem.pegar(c, String(id))
            if (r && c === 'jogos') throw new Error('ja_existe: o banco de jogos não aceita sobrescrever um jogo')
            if (r && r.secao !== secao) throw new Error('codigo: reunião de outra seção')
            o.secao = secao
            await armazem.gravar(c, String(id), secao, o)
            return true
        })
    },
    async apiUpdate(c, id, json, prova) {
        colecao(c)
        if (c === 'base') throw new Error('coleção inválida')
        const parte = JSON.parse(json)
        return emFila(c + ':' + id, async () => {
            const r = await armazem.pegar(c, String(id))
            if (!r) throw new Error('not_found')
            confere(r.secao, prova)
            const o = { ...r.dados, ...parte, secao: r.secao }
            await armazem.gravar(c, String(id), r.secao, o)
            return true
        })
    },
    async apiDelete(c, id, prova) {
        colecao(c)
        if (c === 'base') throw new Error('coleção inválida')
        return emFila(c + ':' + id, async () => {
            const r = await armazem.pegar(c, String(id))
            if (!r) return true
            confere(r.secao, prova)
            await armazem.apagar(c, String(id))
            return true
        })
    },
    // Base compartilhada do plano de segurança: todos leem (apiList('base')); só a diretoria grava.
    async apiBaseSet(id, json, provaDiretoria) {
        confereDiretoria(provaDiretoria)
        id = String(id)
        if (!ID_BASE.test(id)) throw new Error('id inválido')
        const o = JSON.parse(json)
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('dados inválidos')
        if (JSON.stringify(o).length > 600000) throw new Error('dados grandes demais')
        return emFila('base:' + id, async () => { await armazem.gravar('base', id, 'diretoria', o); return true })
    },
    async apiBaseDel(id, provaDiretoria) {
        confereDiretoria(provaDiretoria)
        id = String(id)
        if (!ID_BASE.test(id)) throw new Error('id inválido')
        return emFila('base:' + id, async () => { await armazem.apagar('base', id); return true })
    },
    // Progressão: blocos do ramo da seção. Pede a palavra-código da seção (ou a da diretoria,
    // que pode escolher qualquer ramo).
    async apiProgressao(secao, prova, ramoPedido) {
        let ramo
        if (ramoPedido) {
            confereDiretoria(prova)
            ramo = String(ramoPedido)
        } else {
            confere(String(secao || ''), prova)
            ramo = ramoDaSecao(secao)
        }
        if (!RAMOS.has(ramo)) throw new Error('ramo inválido')
        if (PROG && PROG[ramo]) return PROG[ramo]
        const r = await armazem.pegar('base', 'prog:' + ramo)
        return r ? r.dados : null
    },
    // Diretoria exclui um jogo do banco (jogos fora do padrão), de qualquer seção.
    async apiJogoDelDiretoria(id, provaDiretoria) {
        confereDiretoria(provaDiretoria)
        id = String(id)
        return emFila('jogos:' + id, async () => { await armazem.apagar('jogos', id); return true })
    },
    // Salva a reunião e o formulário numa chamada só.
    async apiSaveReuniao(id, resumoJson, pontosJson, planoJson, prova) {
        const resumo = JSON.parse(resumoJson), pontos = JSON.parse(pontosJson), plano = JSON.parse(planoJson)
        const secao = String(resumo.secao || '')
        confere(secao, prova)
        return emFila('reunioes:' + id, async () => {
            const r = await armazem.pegar('reunioes', String(id))
            if (r && r.secao !== secao) throw new Error('codigo: reunião de outra seção')
            const o = { ...(r ? r.dados : {}), ...resumo }
            if (!o.p && pontos.p) o.p = pontos.p
            o.secao = secao
            await armazem.gravar('reunioes', String(id), secao, o)
            await armazem.gravar('planos', String(id), secao, { ...plano, secao })
            return true
        })
    }
}

app.post('/api/rpc', async c => {
    let corpo
    try { corpo = await c.req.json() } catch { return c.json({ erro: 'pedido inválido' }, 400) }
    const fn = api[corpo && corpo.fn]
    if (!fn || !Array.isArray(corpo.args)) return c.json({ erro: 'função inválida' }, 400)
    try {
        const resultado = await fn(...corpo.args)
        return c.json({ resultado: resultado ?? null })
    } catch (e) {
        const msg = String((e && e.message) || e)
        if (!/^(codigo|not_found|ja_existe|coleção)/.test(msg)) console.error('Erro em', corpo.fn, e)
        return c.json({ erro: msg }, /^codigo/.test(msg) ? 403 : 400)
    }
})

app.get('/saude', c => c.json({ ok: true, armazem: armazem.nome }))

app.use('/*', serveStatic({ root: './public' }))

// Nunca derrubar o servidor por um erro solto: registra e segue.
process.on('unhandledRejection', e => console.error('Erro não tratado:', e))

const porta = Number(process.env.PORT) || 3333
serve({ fetch: app.fetch, port: porta }, () => {
    console.log(`Reuniões do Baleia rodando em http://localhost:${porta} (dados: ${armazem.nome})`)
})
