# NEXA CALENDAR — DIRETRIZES DE DESENVOLVIMENTO E SEGURANÇA

Este documento estabelece as regras permanentes de arquitetura, segurança e governança para assistentes de IA, desenvolvedores e mantenedores do projeto **Nexa Calendar**.

---

## 1. Identidade e Independência do Projeto

* O **Nexa Calendar** é um sistema autônomo e de infraestrutura 100% independente, derivado de uma cópia inicial do Pulse Agenda.
* **Isolamento Absoluto:** Qualquer vínculo com o repositório, banco de dados ou deploy do Pulse Agenda foi permanentemente revogado e é expressamente proibido de ser reestabelecido.
* O repositório Git, o banco de dados Supabase e o deploy na Vercel pertencem exclusivamente à conta e infraestrutura do **Nexa**.

---

## 2. Regras Estritas de Segurança e Infraestrutura

### 2.1. Supabase (BaaS)
* **Credenciais Exclusivas:** As conexões com o banco de dados devem ocorrer **obrigatoriamente** através de variáveis de ambiente configuradas no arquivo `.env` local:
  * `VITE_SUPABASE_URL`
  * `VITE_SUPABASE_ANON_KEY`
* **Bloqueio de URLs Legadas:** É terminantemente proibido reintroduzir a URL legada do Pulse (`zjysxpmfsazqsgwbpppy.supabase.co`) ou chaves hardcoded no código TypeScript/JavaScript.
* A inicialização do cliente em [src/lib/supabase.ts](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/NEXA%20CALENDAR/src/lib/supabase.ts) possui bloqueio programático ativo contra URLs herdadas do Pulse.

### 2.2. Controle de Versão (Git)
* **Repositório Próprio:** O remote `origin` do Git deve apontar apenas para o repositório oficial do Nexa Calendar.
* **Bloqueio de Remotes Antigos:** Nunca configure ou faça push para `Dinheiroemcaixa/pulse-agenda.git`.
* **Proteção de Segredos:** Arquivos `.env` e `.env.*` são ignorados no `.gitignore`. Nunca realize commits de arquivos de ambiente com credenciais reais. Utilize apenas [.env.example](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/NEXA%20CALENDAR/.env.example) para modelos de configuração.

### 2.3. Vercel e Serviços em Nuvem
* Projetos de deploy devem ser criados do zero, sem reaproveitar projetos ou links da Vercel vinculados ao Pulse Agenda.

---

## 3. Padrões de Código e Convenções

* **Chaves de Armazenamento Local (`localStorage`):**
  * Utilize sempre o prefixo `nexa_`:
    * Sessão de usuário: `nexa_session`
    * Tema: `nexa-theme`
    * Filtro de visualização: `nexa_viewingAll`
    * Filtro de membros: `nexa_memberFilter`
    * Backups: `nexa_backup_*`
* **Stack Tecnológica:**
  * **Frontend:** React 18, TypeScript 5, Vite 5, TailwindCSS 3.4.
  * **Backend:** Python 3 + FastAPI + Uvicorn (OCR e processamento de documentos DDA).
* **Idioma e Comunicação:**
  * Toda a documentação e respostas de agentes devem ser entregues em **Português do Brasil (pt-BR)**.
  * Extrema cautela ao refatorar: jamais introduzir quebras de código ou regressões funcionais.
  * Sempre validar a compilação e integridade após alterações (`npm run build`).
