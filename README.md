# Trello to GitHub Projects

## Instalação

```bash
git clone https://github.com/inoa-mgsimao/trello-to-github-projects
cd trello-to-github-projects
npm i
```

## Configurações

As configurações de migração estão no arquivo `config.js`.

### Nome do repositório padrão

Quando o script não conseguir definir em qual repositório do GitHub criar a issue, a issue será criada no repositório definido.

Exemplo:

```js
{
  // ...
  githubDefaultRepository: "cashier",
}
```

### Número do projeto

Para saber o número do projeto em que as issues serão adicionadas, abra o projeto no navegador. O número do projeto estará presente na URL.

Exemplo:

```js
{
  // ...
  githubProjectNumber: 22, // Número do projeto de 'Finantial Solutions'
}
```

### Mapear colunas do Trello para colunas do GitHub Project

No exemplo a seguir, os cards na lista "Doing" no Trello serão inseridos com status "In Progress" no projeto do GitHub.

É recomendável rodar o script 1 coluna por vez. Assim, é mais fácil de acompanhar as mudanças e resolver erros eventuais.

```js
{
  // ...
  trelloToGithubColumnMap: {
    "Doing": "In Progress",
    "Done": "Done",
  },
}
```

> [!NOTE]  
> Somente cards nas colunas mapeadas serão importados. Cards de colunas não-mapeadas serão ignorados.

### Nome do campo de status (opcional)

A maioria dos projetos criados no GitHub possuem um board onde as colunas são definidas através do campo "Status". Caso este não seja o nome do campo no seu projeto, é possível alterar.

Exemplo:

```js
{
  // ...
  githubStatusField: "My status",
}
```

### Incluir cards arquivados (opcional)

Altere a variável
```js
{
  // ...
  includeArchivedCards: true,
}
```

### Mapeamento de repositórios (opcional)

Caso o board no Trello envolva mais de um repositório no GitHub, o repositório onde a issue será criada pode variar.

Nesse caso, é possível mapear o nome de uma coluna ou label no Trello para um repositório no GitHub.

Exemplo:

```js
{
  // ...
  githubRepositoryMapByListOrLabel: {
    "WI": "infra-tech-bt-main",
    "A2": "infra-tech-bt-main",
    "AU": "infra-tech-bt-main",
    "SC": "infra-tech-bt-main",
    "NO": "infra-tech-bt-main",
    "IDX": "indexer",
    "AKI": "akinori",
    "HD": "inoa.helpdesk",
  },
}
```

O script primeiro verificará se a coluna do card do Trello está mapeada para algum repositório.
Caso contrário, verificará a primeira label.
Por último, utilizará o repositório padrão definido.

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

## Como o script funciona?

Para cada card das listas informadas:

1. Busca se uma issue com mesmo nome já foi criada previamente pelo script. A issue deve conter o link para o card original do Trello.
2. Caso não encontre uma issue já criada, cria a issue no repositório informado.
3. Adiciona a issue no projeto informado.
4. Muda o campo "Status" da issue para o valor configurado no mapeamento de colunas.
