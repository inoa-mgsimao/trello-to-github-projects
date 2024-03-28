import { App } from "octokit";
import fs from "fs";
import { exit } from "process";

const githubRepository = "my-repo";   // CHANGE ME!
const githubProjectNumber = 0;        // CHANGE ME!
const trelloToGithubColumnMap = {     // CHANGE ME!
  "Doing": "In Progress",
  "Done": "Done",
}

// Optional settings
const githubOrg = "inoa";
const githubStatusField = "Status";
const includeArchivedCards = false;
const trelloToGithubUserMap = {};

// Authenticate
const githubAppId = 864042;
const githubInstalationId = 48947089;
const githubPrivateKey = fs.readFileSync("private-key.pem", "utf8");
const app = new App({ appId: githubAppId, privateKey: githubPrivateKey });
await app.octokit.rest.apps.getAuthenticated();
const octokit = await app.getInstallationOctokit(githubInstalationId);

const project = (await octokit.graphql(`
  query {
    organization(login: "${githubOrg}") {
      projectV2(number: ${githubProjectNumber}) {
        id
        field(name: "${githubStatusField}") {
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
`)).organization.projectV2;

const trelloColumns = Object.keys(trelloToGithubColumnMap);

const data = JSON.parse(fs.readFileSync("trello.json", "utf8"));

// Map trello list id to github field id
const columnDictionary = trelloColumns.reduce((acc, trelloColumnName) => {
  if (!trelloToGithubColumnMap[trelloColumnName]) {
    console.error("Unexpected error: Trello column not found");
    exit(1);
  }
  const githubColumnName = trelloToGithubColumnMap[trelloColumnName];

  const trelloList = data.lists.find(l => l.name === trelloColumnName);
  if (!trelloList) {
    console.error(`Trello column not found: ${trelloColumnName}`);
    exit(1);
  }

  const githubField = project.field.options.find(o => o.name === githubColumnName);
  if (!githubField) {
    
    console.error(`GitHub column not found: ${githubColumnName}`);
    exit(1);
  }

  acc[trelloList.id] = githubField.id;
  return acc;
}, {});

// Map member id in trello to github username
const userDictionary = data.members.reduce((acc, member) => {
  if (trelloToGithubUserMap[member.username]) {
    acc[member.id] = trelloToGithubUserMap[member.username];
    return acc;
  }

  acc[member.id] = `inoa-${member.username.replace("_inoa", "")}`;
  return acc;
}, {});

const cards = data.cards
  .filter(card => Object.keys(columnDictionary).includes(card.idList))
  .filter(card => {
    if (includeArchivedCards) return true;

    return card.closed === false;
  });

cards.forEach(async card => {
  let issue = await tryGetIssue(card);
  if (issue) {
    console.log(`Issue #${issue.number} used for card '${card.name}'.`);
  }

  if (!issue) {
    issue = await createIssue(card);
    console.log(`Issue #${issue.number} created for card '${card.name}'.`);
  }

  const itemId = await addIssueToProject(issue);
  console.log(`Issue #${issue.number} added to project. (${itemId})`);

  const status = await setItemStatus(card, itemId);
  console.log(`Issue #${issue.number} status updated to '${status}'.`);
});

// Functions

async function tryGetIssue(card) {
  const searchResult = await octokit.rest.search.issuesAndPullRequests({
    q: `repo:${githubOrg}/${githubRepository} is:issue author:app/trello-to-github-projects "${card.name}" in:title`,
  });

  return searchResult.data.items.find(i => i.body.includes(`- [Trello](${card.shortUrl})`));
}

async function createIssue(card) {
  let body = '';
  if (card.desc.length > 0) {
    body += `${card.desc}\n\n---\n\n`;
  }
  body += `- [Trello](${card.shortUrl})`;
  card.attachments.forEach(attachment => {
    body += `\n- [${attachment.name}](${attachment.url})`;
  });

  const issue = await octokit.rest.issues.create({
    owner: githubOrg,
    repo: githubRepository,
    title: card.name,
    body: body,
    assignees: card.idMembers.map(id => userDictionary[id]),
    labels: card.labels.map(label => label.name).filter(label => label !== "GitHub"),
  });

  // Add comments
  data.actions
    .filter(action => action.type === "commentCard" && action.data.card.id === card.id)
    .map(action => ({ memberId: action.memberCreator.id, text: action.data.text, date: action.date }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(async c => {
      await octokit.rest.issues.createComment({
        owner: githubOrg,
        repo: githubRepository,
        issue_number: issue.data.number,
        body: `**@${userDictionary[c.memberId]} em ${c.date}**\n\n>${c.text}`,
      })
    });

  return issue.data;
}

async function addIssueToProject(issue) {
  const response = await octokit.graphql(`mutation {
    addProjectV2ItemById(input: {projectId: "${project.id}" contentId: "${issue.node_id}"}) {
      item {
        id
      }
    }
  }`);
  
  return response.addProjectV2ItemById.item.id;
}

async function setItemStatus(card, itemId) {
  const response = await octokit.graphql(`mutation {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${project.id}"
        itemId: "${itemId}"
        fieldId: "${project.field.id}"
        value: {
          singleSelectOptionId: "${columnDictionary[card.idList]}"
        }
      }
    ) {
      projectV2Item {
        fieldValueByName(name: "${githubStatusField}") {
          ... on ProjectV2ItemFieldSingleSelectValue {
            name
          }
        }
      }
    }
  }`);

  return response.updateProjectV2ItemFieldValue.projectV2Item.fieldValueByName.name;
}
