# Sistema de Gestao de Fomentos Sociais

SPA em React + Vite para gerenciar sincronizacao de base CSV, destinacoes de fomento e confirmacao de pagamento com persistencia no Firebase Firestore.

## Stack

- React 19 + Vite
- Tailwind CSS
- Firebase Firestore (SDK Web)
- PapaParse (CSV)
- react-hot-toast (feedback)

## Funcionalidades implementadas

- Dashboard com total disponivel (base CSV), total destinado e saldo consolidado.
- Sincronizacao de CSV via URL publica com upsert em `base_csv` usando `PROCESSO` como chave.
- Workflow A: formulario de destinacao com autocomplete de processo, auto-preenchimento e calculo de saldo disponivel.
- Workflow B: confirmacao de pagamento para registros pendentes (`statusPagamento = pendente`).
- Cadastro de empresas (com mascara de CNPJ).
- Cadastro de entidades com categoria e helper descritivo por categoria.
- Datas em formato brasileiro e valores em BRL.
- Toasts de sucesso/erro para operacoes no Firestore.
- Autenticacao Firebase (email/senha e Google) com bloqueio da aplicacao para usuarios nao autenticados.
- Auditoria de autoria nas escritas com campos `createdBy` e `updatedBy`.
- Controle de acesso por perfil (`admin` e `OPERADOR`) com regra e interface.
- Tela administrativa para gestao de usuarios e troca de perfis.

## Estrutura principal

- `src/App.jsx`: interface e fluxos da aplicacao.
- `src/services/csvService.js`: leitura/parsing CSV com `fetch` + `PapaParse`.
- `src/services/firestoreService.js`: operacoes de leitura/escrita no Firestore.
- `src/lib/firebase.js`: inicializacao do Firebase.
- `src/lib/formatters.js`: utilitarios de formato para moeda, data, competencia e CNPJ.
- `src/lib/constants.js`: opcoes e descricoes de categorias e formas de pagamento.
- `firestore.rules`: regras sugeridas de seguranca.

## Configuracao local

1. Instale as dependencias:

```bash
npm install
```

2. Crie o arquivo `.env` com base em `.env.example` e preencha os dados do seu projeto Firebase:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

3. Execute em desenvolvimento:

```bash
npm run dev
```

4. Build de producao:

```bash
npm run build
```

## Firestore (colecoes)

- `empresas`: `{ razaoSocial, cnpj, createdAt }`
- `entidades`: `{ nome, categoria, descricaoCategoria, createdAt }`
- `destinacoes`: `{ processoId, termo, empresa, produto, valorFomento, solicitacaoData, entidadeId, entidadeNome, valorDestinado, competencia, statusPagamento, pgtoData, formaPgto, createdAt, updatedAt }`
- `base_csv`: `{ processoId, termo, empresa, produto, valorFomento, syncedAt, updatedAt }`
- `users`: `{ uid, email, role, createdAt, updatedAt, createdBy, updatedBy }`

## Regras de seguranca

O arquivo `firestore.rules` inclui protecao para permitir leitura/escrita apenas para usuarios autenticados. Para aplicar:

```bash
firebase deploy --only firestore:rules
```

Para `destinacoes`, `entidades` e `empresas`, as regras exigem:

- `create`: `createdBy` e `updatedBy` iguais ao `uid` do usuario autenticado.
- `update`: `createdBy` imutavel e `updatedBy` igual ao `uid` do usuario autenticado.
- `delete`: bloqueado por regra.

Modelo de perfis:

- `OPERADOR`: pode criar/atualizar destinacoes e confirmar pagamentos.
- `admin`: possui acesso total, incluindo sincronizacao de `base_csv` e cadastros base (`empresas` e `entidades`).

Ao autenticar pela primeira vez, o app cria automaticamente `users/{uid}` com `role: OPERADOR`.
Para promover um usuario a `admin`, atualize manualmente o campo `role` no Firestore Console (ou via script backend seguro).

Agora o proprio app possui um painel de gestao de usuarios (aba Cadastros base, visivel apenas para admin), com acao para alternar o perfil entre `OPERADOR` e `admin`.

## Deploy na Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Defina no painel da Vercel as mesmas variaveis `VITE_FIREBASE_*` do `.env`
