# Reuniões do Baleia

App de programação das reuniões de sábado dos Escoteiros do Baleia (23º/MG G.E. Antônio Mourão Guimarães).

O chefe escolhe a sua seção, monta a reunião, busca jogos no banco do grupo, lança a pontuação das patrulhas durante a atividade e gera o PDF no modelo do grupo (logos da UEB e do Baleia, faixa vermelha e azul, seções numeradas e coloridas).

Pode rodar de dois jeitos (o mesmo app nos dois):

- **Servidor próprio (Node.js + Supabase, publicado no Railway)** — igual ao IFPlay. Atualiza sozinho a cada mudança no GitHub.
- **Google Apps Script**, com os dados numa planilha do Google Drive.

Nos dois, não precisa de login: basta o link e a palavra-código da seção.

## Pastas

| Pasta | O que tem |
|---|---|
| `server.js`, `armazem.js`, `package.json` | Servidor Node.js (Hono) que entrega o app e guarda os dados no Supabase. |
| `public/` | App servido pelo servidor (gerado pelo `montar.py`). |
| `sql/` | `criar-tabelas.sql`: tabelas do Supabase (inclui `planos_seguranca` e `base_seguranca`). |
| `public/logos/`, `public/icones/` | Logos das seções e ícones do app instalável. |
| `public/manifest.webmanifest`, `public/sw.js` | Deixam o app instalável no celular (Android e iPhone). |
| `apps-script/` | **Arquivos prontos para colar no Apps Script.** `Code.gs` vai no arquivo `Código.gs`; `index.html` vai no arquivo `index`. |
| `codigo-fonte/` | Código-fonte do app (`app.html`), modelo do servidor (`Code.modelo.gs`), banco inicial de jogos (`jogos.json`), logos e o script `montar.py`, que gera `public/index.html` e os arquivos de `apps-script/`. |

## O que o app faz

- **Entrada em árvore:** os ramos crescem das Ninhadas (no alto) até os Pioneiros, com a raiz do grupo embaixo. Ao entrar na seção, o chefe escolhe **Preparar reunião** ou **Criar plano de segurança**.
- **Planos de segurança** (`/seguranca.html`, só na versão servidor): cada seção tem a sua lista de planos, embaralhados com a palavra-código da seção. Locais salvos, base de delegacias/hospitais e nomes da diretoria ficam na base compartilhada, que só a palavra da diretoria altera ("Modo diretoria"). Anexos ficam no aparelho e entram no PDF.
- **App instalável:** no Android, Chrome → "Instalar app"; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início".

- **Capa por seção** com palavra-código. Cada aparelho fica liberado só para a seção cuja palavra foi digitada; a palavra da diretoria libera todas.
- **Formulário da reunião** em seções numeradas: identificação, objetivos (eixos de progressão), pontuação, programação, cuidados e avisos, lembretes e anexos. Pula sozinho para a próxima seção, confere campos obrigatórios e guarda rascunho no aparelho.
- **Atividades** com tipo (Abertura, Quebra-gelo, Canção, Capacitação, Jogo ativo, Observação, Revezamento, Grande jogo…), nome, duração, responsável, descrição, intencionalidade educativa, material, eixos e se pontua apresentação/jogo.
- **Banco de jogos** compartilhado entre as seções: 32 jogos iniciais + os jogos novos que os chefes salvam. Jogo puxado do banco não pode ser salvo de novo (as alterações valem só para a reunião); para jogos digitados, o app avisa quando a descrição é muito parecida com um jogo existente.
- **Pontuação e premiação** (só tropas): colocações por atividade, jogos extras, pontos extras e descontos por patrulha, campeã da reunião e ranking do ciclo. Funciona no celular durante a atividade e guarda no aparelho se faltar internet.
- **PDF** em A4 deitado, com a grade de pontuação das patrulhas (preenchida se os pontos já foram lançados) e anexos (fotos/PDF) ao final.

## Publicar no Railway + Supabase (igual ao IFPlay)

### 1. Banco de dados (Supabase, uma vez)
1. No projeto do Supabase: **SQL Editor → New query**, colar todo o conteúdo de `sql/criar-tabelas.sql` e clicar em **Run**.
2. Em **Project Settings → API Keys**, copiar:
   - a **URL do projeto** (`https://xxxx.supabase.co`);
   - a chave **secreta** (`service_role` ou `sb_secret_...`). Ela fica só no servidor; nunca no app nem no GitHub.

### 2. Servidor (Railway, uma vez)
1. Entrar em **railway.com** com a conta do GitHub.
2. **New Project → Deploy from GitHub repo** → escolher `APLICATIVO-REUNI-ES-DO-BALEIA`.
3. No serviço criado, aba **Variables**, adicionar:
   - `SUPABASE_URL` = URL do projeto
   - `SUPABASE_SERVICE_KEY` = chave secreta
   - `NODE_ENV` = `production`
4. Aba **Settings → Networking → Generate Domain**: o Railway cria o link do app (algo como `reunioes-baleia.up.railway.app`).
5. Abrir `https://SEU-LINK/saude`: deve aparecer `{"ok":true,"armazem":"Supabase"}`.

A partir daí, cada mudança enviada ao GitHub (branch `main`) é publicada sozinha.

### Rodar no computador

```bash
npm install
npm run dev
```

Abre em `http://localhost:3333`. Sem o arquivo `.env`, os dados ficam num arquivo local de teste (`dados-locais.json`). Para usar o Supabase, copie `.env.example` para `.env` e preencha.

## Versão Google Apps Script

### Instalar (uma vez)

1. Google Drive → Novo → Planilhas Google → "Reuniões do Baleia – dados".
2. Na planilha: Extensões → Apps Script. Apagar o conteúdo de `Código.gs` e colar o de `apps-script/Code.gs`. Salvar.
3. "+" ao lado de Arquivos → HTML → nome `index`. Apagar o conteúdo e colar o de `apps-script/index.html` (abrir num editor de texto, não no navegador). Conferir que a última linha é `</html>`. Salvar.
4. Implantar → Nova implantação → App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa. Implantar e autorizar (em "O Google não verificou este app": Avançado → Acessar).
5. Copiar o URL do app da Web (termina em `/exec`) e mandar aos chefes.

### Atualizar

1. Colar o novo `apps-script/index.html` no arquivo `index` (e o novo `apps-script/Code.gs`, se mudou). Salvar.
2. Implantar → Gerenciar implantações → lápis → Versão: **Nova versão** → Implantar. O link continua o mesmo.
3. Recarregar o app com Ctrl+Shift+R (Cmd+Shift+R no Mac).

## Mudar o app

Editar os arquivos de `codigo-fonte/` e rodar, dentro dessa pasta:

```bash
python3 montar.py
```

O script gera de novo `public/index.html` (servidor) e os dois arquivos de `apps-script/` (Google). Precisa de Python 3 e Node.js. Depois é só enviar ao GitHub: o Railway publica sozinho.

## Onde ficam os dados

No Supabase, tabelas `reunioes`, `formularios` e `jogos` (só o servidor acessa). No Google, as abas da planilha:

| Aba | Conteúdo |
|---|---|
| Reuniões | Uma linha por reunião, com a pontuação. Conteúdo embaralhado (criptografado) com a palavra-código da seção. |
| Formulários | Programação completa de cada reunião, também embaralhada. |
| Banco de jogos | Jogos criados pelos chefes, legíveis. |

Não editar as abas à mão, exceto para apagar uma linha inteira de teste (nunca a primeira linha).

## Palavras-código

- **Não estão neste repositório.** Ficam com a diretoria.
- `conferencia-codigos.json` guarda só dados de conferência (resumos criptográficos), que não revelam as palavras.
- Se a palavra da diretoria se perder, os dados criptografados não podem ser recuperados.
- Trocar palavras exige gerar novos dados de conferência e uma nova versão do app.

## Regras do grupo usadas no app

- Seções: Ninhada 1 e 2; Alcateias Lobo Guará, Sabiá e Túnel do Morcego; Tropas Escoteiras Hussardos, Lis de Ouro e Scorpions; Tropas Sênior Botocudos Pankas e Kakremaan; Clã Zulu Mac Smyth.
- Pontuação só nas tropas, com patrulhas fixas:
  - Hussardos: Águia, Coruja, Crater, Leopardo
  - Lis de Ouro: Hydra, Fênix, Draco, Órion
  - Scorpions: Jaguar, Gavião, Lupu, Raposa
  - Botocudos Pankas: Jívaros, Kraho, Kiriurô Nomani, Marjó
  - Kakremaan: Kaxinawá, Krenak, Maxakalí, Aruan
- Pontos padrão: jogos 100/80/60/40; apresentação 50/40/30/20.
- Ciclo: 1º ou 2º ciclo do ano. Premiação = soma das reuniões do ciclo; empate decidido por vitórias em reunião.
- Eixos de progressão: Habilidades para a Vida, Meio Ambiente, Paz e Desenvolvimento, Saúde e Bem-estar.
