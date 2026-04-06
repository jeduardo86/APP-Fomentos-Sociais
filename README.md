# Sistema de Gestão de Fomentos Sociais

SPA em React + Vite para gerenciar sincronização de base CSV, destinações de fomento e confirmação de pagamento com persistência no Firebase Firestore.

## Stack

- React 19 + Vite
- Tailwind CSS
- Firebase Firestore (SDK Web)
- PapaParse (CSV)
- react-hot-toast (feedback)

## Funcionalidades implementadas

- Dashboard com total disponível (base CSV), total destinado e saldo consolidado.
- Sincronização de CSV via URL pública com upsert em `base_csv` usando `PROCESSO` como chave.
- Workflow A: formulário de destinação com autocomplete de processo, auto-preenchimento e cálculo de saldo disponível.
- Workflow B: confirmação de pagamento para registros pendentes (`statusPagamento = pendente`).
- Cadastro de operadores lotéricos (com máscara de CNPJ).
- Cadastro de entidades com categoria e helper descritivo por categoria.
- Datas em formato brasileiro e valores em BRL.
- Toasts de sucesso/erro para operacoes no Firestore.
- Autenticação Firebase (email/senha e Google) com bloqueio da aplicação para usuários não autenticados.
- Auditoria de autoria nas escritas com campos `createdBy` e `updatedBy`.
- Controle de acesso por perfil (`admin` e `OPERADOR`) com regra e interface.
- Tela administrativa para gestão de usuários e troca de perfis.

## Estrutura principal

- `src/App.jsx`: interface e fluxos da aplicação.
- `src/services/csvService.js`: leitura/parsing CSV com `fetch` + `PapaParse`.
- `src/services/firestoreService.js`: operações de leitura/escrita no Firestore.
- `src/lib/firebase.js`: inicialização do Firebase.
- `src/lib/formatters.js`: utilitários de formato para moeda, data, competência e CNPJ.
- `src/lib/constants.js`: opções e descrições de categorias e formas de pagamento.
- `firestore.rules`: regras sugeridas de segurança.

## Configuração local

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

4. Build de produção:

```bash
npm run build
```

## Firestore (coleções)

- `empresas`: `{ razaoSocial, cnpj, createdAt }`
- `entidades`: `{ nome, categoria, descricaoCategoria, createdAt }`
- `destinacoes`: `{ processoId, termo, empresa, produto, valorFomento, solicitacaoData, entidadeId, entidadeNome, valorDestinado, competencia, statusPagamento, pgtoData, formaPgto, createdAt, updatedAt }`
- `base_csv`: `{ processoId, termo, empresa, produto, valorFomento, syncedAt, updatedAt }`
- `users`: `{ uid, email, role, createdAt, updatedAt, createdBy, updatedBy }`

## Regras de segurança

O arquivo `firestore.rules` inclui proteção para permitir leitura/escrita apenas para usuários autenticados. Para aplicar:

```bash
firebase deploy --only firestore:rules
```

Para `destinacoes`, `entidades` e a coleção `empresas` (operadores lotéricos), as regras exigem:

- `create`: `createdBy` e `updatedBy` iguais ao `uid` do usuário autenticado.
- `update`: `createdBy` imutável e `updatedBy` igual ao `uid` do usuário autenticado.
- `delete`: bloqueado por regra.

Modelo de perfis:

- `OPERADOR`: pode criar/atualizar destinações e confirmar pagamentos.
- `admin`: possui acesso total, incluindo sincronização de `base_csv` e cadastros base de operadores lotéricos (`empresas`) e entidades.

Ao autenticar pela primeira vez, o app cria automaticamente `users/{uid}` com `role: OPERADOR`.
Para promover um usuário a `admin`, atualize manualmente o campo `role` no Firestore Console (ou via script backend seguro).

Agora o próprio app possui um painel de gestão de usuários (aba Cadastros base, visível apenas para admin), com ação para alternar o perfil entre `OPERADOR` e `admin`.

## Deploy na Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Defina no painel da Vercel as mesmas variáveis `VITE_FIREBASE_*` do `.env`
