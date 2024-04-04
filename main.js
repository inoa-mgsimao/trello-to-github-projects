import { App } from 'octokit'
import fs from 'fs'
import config from './config.js'

let _trelloLists
let _trelloCards

let _octokit
let _githubProject
let _trelloListNameTogithubColumnId = {}

function loadTrelloListsAndCardsFromJson() {
    const data = JSON.parse(fs.readFileSync(config.trelloJsonFileName, "utf8"))

    let listsMap = {}
    let labelsMap = {}
    let membersMap = {}
    let checkListsMap = {}
    let customFieldsMap = {}
    let commentsMap = {}

    data.lists
        .filter(l => config.trelloToGithubColumnMap[l.name])
        .filter(l => config.includeArchivedCards || !l.closed)
        .forEach(l => listsMap[l.id] = l)

    data.members.forEach(m => membersMap[m.id] = m)
    data.labels.forEach(l => labelsMap[l.id] = l)
    data.checklists.forEach(cl => checkListsMap[cl.id] = cl)
    data.customFields.forEach(cf => customFieldsMap[cf.id] = cf)

    data.actions
        .filter(a => a.type == 'commentCard')
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(a => {
            let cardId = a.data.card.id
            if (!commentsMap[cardId]) commentsMap[cardId] = []
            commentsMap[cardId].push({
                date: a.date,
                member: membersMap[a.idMemberCreator].username,
                text: a.data.text
            })
        })
        
    _trelloLists = Object.values(listsMap).map(l => l.name)

    _trelloCards = data.cards
        .filter(c => listsMap[c.idList] && (config.includeArchivedCards || !c.closed))
        .map(c => {
            let simpleCard = {}
            simpleCard.id = c.id
            simpleCard.closed = c.closed
            simpleCard.desc = c.desc
            simpleCard.labels = c.idLabels.map(id => ({ name: labelsMap[id].name, color: labelsMap[id].color }))
            simpleCard.list = listsMap[c.idList].name
            simpleCard.members = c.idMembers.map(id => membersMap[id].username)
            simpleCard.checklists = c.idChecklists.map(id => ({
                name: checkListsMap[id].name,
                items: checkListsMap[id].checkItems.map(ci => ({
                    name: ci.name,
                    complete: ci.state === 'complete',
                })),
            }))
            simpleCard.name = c.name
            simpleCard.shortUrl = c.shortUrl
            simpleCard.url = c.url
            simpleCard.attachments = c.attachments.map(a => ({ name: a.name, url: a.url }))
            simpleCard.comments = commentsMap[c.id] ?? []
            return simpleCard
        })
}

async function connectToGithub() {
    const githubPrivateKey = fs.readFileSync(config.githubPrivateKeyFileName, "utf8")
    const app = new App({ appId: config.githubAppId, privateKey: githubPrivateKey })
    await app.octokit.rest.apps.getAuthenticated()
    _octokit = await app.getInstallationOctokit(config.githubInstalationId)
}

async function loadGithubProject() {
    let response = await _octokit.graphql(`
        query {
            organization(login: "${config.githubOrg}") {
                projectV2(number: ${config.githubProjectNumber}) {
                    id
                    fields(first: 100) {
                        nodes {
                            ... on ProjectV2FieldCommon {
                                id
                                name
                            }
                            ... on ProjectV2SingleSelectField {
                                options {
                                    id
                                    name
                                }
                            }
                        }
                    }
                }  
            }
        }
    `)

    _githubProject = response.organization.projectV2
    _githubProject.queryFields = {}
    _githubProject.queryFields[config.githubStatusField] = _githubProject.fields.nodes.filter(f => f.name === config.githubStatusField)[0]
}

function loadGithubColumnIds() {
    _trelloLists.forEach(trelloListName => {
        let githubColumnName = config.trelloToGithubColumnMap[trelloListName]
        let githubColumn = _githubProject.queryFields[config.githubStatusField].options.find(o => o.name === githubColumnName)
        if (!githubColumn) {
            console.error(`GitHub column not found: ${githubColumnName}`)
            exit(1)
        }
        _trelloListNameTogithubColumnId[trelloListName] = githubColumn.id
    })
}

async function tryGetGithubIssue(trelloCard, githubRepository) {
    const searchResult = await _octokit.rest.search.issuesAndPullRequests({
        q: `repo:${config.githubOrg}/${githubRepository} is:issue author:app/trello-to-github-projects "${trelloCard.name}" in:title`,
    })

    return searchResult.data.items.find(i => i.body.includes(`- [Trello](${trelloCard.shortUrl})`))
}

function createChecklistMarkdown(checklist) {
    const title = `# ${checklist.name}`
    const checkItems = checklist.items.map(ci =>
        `- [${ci.complete ? 'x' : ' '}] ${ci.name}`)

    return `${title}\n${checkItems.join('\n')}`
}

function parseChecklists(checklists) {
    if (!checklists || checklists.length === 0) return ''
    return checklists.map(checklist => createChecklistMarkdown(checklist)).join('\n\n---\n\n')
}

function trelloUsernameToGithubUsername(username) {
    return `inoa-${username.replace("_inoa", "")}`
}

async function createGithubIssue(trelloCard, githubRepository) {
    let body = ''
    if (trelloCard.desc.length > 0) {
      body += `${trelloCard.desc}\n\n---\n\n`
    }
    body += `${parseChecklists(trelloCard.checklists)}`
    body += trelloCard.pullRequestLink || ''
    body += `- [Trello](${trelloCard.shortUrl})`

    trelloCard.attachments.forEach(attachment => {
      body += `\n- [${attachment.name}](${attachment.url})`
    })    

    const issue = await _octokit.rest.issues.create({
      owner: config.githubOrg,
      repo: githubRepository,
      title: trelloCard.name,
      body: body,
      assignees: trelloCard.members.map(trelloUsernameToGithubUsername),
      labels: trelloCard.labels.map(label => label.name),
    })

    for (c of trelloCard.comments) {
        await _octokit.rest.issues.createComment({
            owner: config.githubOrg,
            repo: githubRepository, //
            issue_number: issue.data.number,
            body: `**@${trelloUsernameToGithubUsername(c.member)} em ${c.date}**\n\n>${c.text}`,
          })
    }

    return issue.data
}

async function addGithubIssueToProject(issue) {
    const response = await _octokit.graphql(`mutation {
        addProjectV2ItemById(input: {projectId: "${_githubProject.id}" contentId: "${issue.node_id}"}) {
            item {
                id
            }
        }
    }`)

    return response.addProjectV2ItemById.item.id
}

async function setGithubItemStatus(trelloCard, itemId) {
    const response = await _octokit.graphql(`mutation {
        updateProjectV2ItemFieldValue(
            input: {
                projectId: "${_githubProject.id}"
                itemId: "${itemId}"
                fieldId: "${_githubProject.queryFields[config.githubStatusField].id}"
                value: {
                    singleSelectOptionId: "${_trelloListNameTogithubColumnId[trelloCard.list]}"
                }
            }
            ) {
                projectV2Item {
                    fieldValueByName(name: "${config.githubStatusField}") {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                    }
                }
            }
        }
    }`)

    return response.updateProjectV2ItemFieldValue.projectV2Item.fieldValueByName.name
}

async function migrate() {
    for (let trelloCard of _trelloCards) {
        // lógica para selecionar o repositório
        let trelloRepository = config.githubRepositoryMapByListOrLabel[trelloCard.list]
            ? trelloCard.list
            : trelloCard.labels[0]?.name
        let githubRepository = config.githubRepositoryMapByListOrLabel[trelloRepository] ?? config.githubDefaultRepository;

        let issue = await tryGetGithubIssue(trelloCard, githubRepository)
    
        if (issue) {
            console.log(`Issue #${issue.number} used for card '${trelloCard.name}'.`)
        }

        if (!issue) {
            issue = await createGithubIssue(trelloCard, githubRepository)
            console.log(`Issue #${issue.number} created for card '${trelloCard.name}'.`)
        }

        const itemId = await addGithubIssueToProject(issue)
        console.log(`Issue #${issue.number} added to project. (${itemId})`)

        const status = await setGithubItemStatus(trelloCard, itemId)
        console.log(`Issue #${issue.number} status updated to '${status}'.`)
    }
}

Promise.resolve()
    .then(() => loadTrelloListsAndCardsFromJson())
    .then(() => connectToGithub())
    .then(() => loadGithubProject())
    .then(() => loadGithubColumnIds())
    .then(() => migrate())
