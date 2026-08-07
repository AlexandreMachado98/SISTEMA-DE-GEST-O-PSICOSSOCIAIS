# AM TST — Gestão SST

Backend real para o sistema `am-tst-sistema.html`, sem dependências externas. Usa Node.js 22+ e SQLite por meio de `node:sqlite`.

## Estrutura

- `server.js` — servidor HTTP e API REST.
- `db.js` — criação/configuração do SQLite e tabelas.
- `auth.js` — cadastro, login, hash de senha com scrypt e sessões.
- `public/am-tst-sistema.html` — frontend integrado à API.
- `data/` — banco SQLite criado automaticamente na primeira execução.

## Executar

1. Instale Node.js 22 ou superior.
2. Extraia o projeto.
3. Opcionalmente copie `.env.example` para `.env` e exporte as variáveis no ambiente (o projeto não usa dotenv).
4. Execute `node server.js`.
5. Abra `http://localhost:3000`.

Não é necessário executar `npm install`: o projeto não possui dependências externas.

## Banco

O SQLite cria as tabelas `users`, `sessions`, `companies` e `assessments`. Empresas e avaliações ficam vinculadas ao usuário autenticado. Excluir uma empresa exclui automaticamente suas avaliações por chave estrangeira com `ON DELETE CASCADE`.

## Primeiro acesso

O primeiro usuário cadastrado recebe automaticamente o papel `admin`. Os demais recebem `user`. Senhas são armazenadas apenas como hash `scrypt` com salt aleatório. As sessões usam tokens aleatórios cujo hash SHA-256 é salvo no banco.

## API principal

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/state`
- `POST /api/companies`
- `DELETE /api/companies/:id`
- `POST /api/assessments`
- `DELETE /api/assessments/:id`
- `GET /api/admin/users` (admin)
- `GET /api/health`

## Observação

Este pacote mantém o layout e os módulos existentes do HTML, mas substitui o `window.storage` por chamadas reais à API. O arquivo original já tinha empresas, avaliações HSE-IT/COPSOQ II e estatísticas; esses dados agora são persistidos no SQLite do backend.
