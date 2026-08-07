# AM TST — Gestão SST

Sistema web de Gestão em Saúde e Segurança do Trabalho com **Node.js puro + SQLite nativo**, sem dependências externas e sem `npm install`.

## Módulos

- Autenticação: cadastro, login, logout, sessões e perfis admin/usuário.
- Empresas: cadastro e exclusão.
- Colaboradores: cadastro, setor, cargo, CPF, admissão e status.
- PGR: versão, status, validade, responsável e observações.
- PCMSO: versão, status, validade, médico coordenador e responsável.
- LTCAT: versão, status, validade e responsável técnico.
- Inventário de riscos: perigo, grupo, fonte, consequências, controles, probabilidade, severidade e nível.
- Treinamentos: NR, data, validade, carga horária e instrutor.
- ASO: admissional, periódico, retorno, mudança de risco e demissional, com resultado e validade.
- CAT: acidente típico, trajeto ou doença ocupacional, colaborador, CID e status.
- eSocial SST: S-2210, S-2220 e S-2240, referência, protocolo e status.
- Documentos: tipo, emissão, validade, responsável e link/arquivo.
- Dashboard operacional com contadores e alertas de vencimento em até 30 dias.
- Riscos psicossociais: HSE-IT e COPSOQ II, preservados do sistema original.

## Estrutura

- `server.js` — servidor HTTP e API REST.
- `db.js` — SQLite, esquema e índices.
- `auth.js` — autenticação, scrypt e sessões.
- `public/am-tst-sistema.html` — frontend completo.
- `data/am-tst.sqlite` — criado automaticamente na primeira execução.

## Executar

1. Instale Node.js 22.
2. Extraia o ZIP.
3. Opcionalmente configure `PORT`, `DB_PATH`, `DATA_DIR` e `SESSION_DAYS` no ambiente.
4. Execute `node server.js`.
5. Abra `http://localhost:3000`.

Não execute `npm install`: o projeto não possui dependências externas.

## Banco de dados

O banco contém as tabelas `users`, `sessions`, `companies`, `assessments`, `employees`, `pgr`, `pcmso`, `ltcat`, `risks`, `trainings`, `asos`, `cats`, `esocial_events` e `documents`. Todas as tabelas operacionais são vinculadas ao usuário e à empresa. As relações usam chaves estrangeiras e exclusão em cascata quando apropriado.

## Primeiro acesso

O primeiro usuário cadastrado recebe automaticamente `admin`. Os demais recebem `user`. As senhas são protegidas com `scrypt` + salt aleatório. Tokens de sessão não são armazenados em texto puro: somente seu hash SHA-256 é persistido.

## API

Autenticação:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Base:
- `GET /api/state`
- `GET /api/sst/summary`
- `GET /api/health`

SST:
- `/api/companies`
- `/api/employees`
- `/api/pgr`
- `/api/pcmso`
- `/api/ltcat`
- `/api/risks`
- `/api/trainings`
- `/api/asos`
- `/api/cats`
- `/api/esocial`
- `/api/documents`

Cada módulo possui operações de listagem, criação e exclusão; colaboradores e alguns registros também aceitam atualização via `PUT`.

Administração:
- `GET /api/admin/users` — somente administrador.

## Segurança e produção

O projeto foi pensado para rodar localmente ou em um servidor Node. Para produção, use HTTPS/reverse proxy, backup periódico do arquivo SQLite, política de senhas adequada, controle de acesso por função e armazenamento seguro dos segredos do ambiente.

Este sistema é uma base técnica de gestão e **não substitui a análise profissional, assinatura ou responsabilidade legal dos documentos de SST quando exigidas pela legislação aplicável**.


## Acesso durante o desenvolvimento

O sistema está temporariamente com a autenticação desativada para facilitar os testes. Ao abrir `http://localhost:3000`, o backend cria/usa automaticamente o usuário de desenvolvimento `AM TST — Acesso de Desenvolvimento`.

Para reativar login e senha antes de colocar o sistema em produção, defina `AUTH_DISABLED=false` no ambiente e reinicie o servidor.
