# Trello to GitHub Projects

## Instalação

```bash
git clone https://github.com/inoa-mgsimao/trello-to-github-projects && \
cd trello-to-github-projects && \
npm i
```

## Configurações

As configurações do script de migração estão no topo do arquivo `main.js`.

### Nome do repositório

Por enquanto, este script suporta somente um repositório.

Exemplo:

```js
const githubRepository = "cashier";
```

### Número do projeto

Para saber o número do projeto em que as issues serão adicionadas, abra o projeto no navegador. O número do projeto estará presente na URL.

Exemplo:

```js
const githubProjectNumber = 22; // Número do projeto de Finantial Solutions
```

### Mapear colunas do Trello para colunas do GitHub Project

No exemplo a seguir, os cards na lista "Doing" no Trello serão inseridos com status "In Progress" no projeto do GitHub.

```js
const trelloToGithubColumnMap = {
  "Doing": "In Progress",
  "Done": "Done",
}
```

> [!NOTE]  
> Somente cards nas colunas mapeadas serão importados. Cards de colunas não-mapeadas serão ignorados.

### Nome do campo de status (opcional)

A maioria dos projetos criados no GitHub possuem um board onde as colunas são definidas através do campo "Status". Caso este não seja o nome do campo no seu projeto, é possível alterar.

Exemplo:

```js
const githubStatusField = "My status";
```

### Incluir cards arquivados (opcional)

Altere a variável
```js
const includeArchivedCards = true;
```

### Mapear usuários Trello para usuários GitHub (opcional)

Se o nome dos usuários seguir o padrão da Inoa, não é necessário alterar esta configuração.

Exemplo: `mgsimao_inoa` será automaticamente convertido para `inoa-mgsimao`.

Caso contrário, alterar a seguinte configuração, onde as chaves são o usuário no Trello e os valores são o usuário no GitHub.

```js
const trelloToGithubUserMap = {
    "mgsimao1_inoa": "inoa-mgsimao",
}
```

## Credenciais

Para fazer uso das APIs do GitHub, é necessário incluir um arquivo contendo a *private key* no mesmo diretório do script.

O arquivo deve ser nomeado `private-key.pem`.

## Executando a migração

1. Abra o board do Trello no navegador.
2. Adicone `.json` no final da URL.
3. Salve o conteúdo (<kbd>Ctrl</kbd> + <kbd>S</kbd>) como `trello.json` dentro da pasta do script.
1. Execute o script de migração 
    ```bash
    node main.js
    ```