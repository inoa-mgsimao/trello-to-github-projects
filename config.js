export default {
    githubDefaultRepository: "my-repo", // CHANGE ME!
    githubProjectNumber: 0,             // CHANGE ME!
    trelloToGithubColumnMap: {          // CHANGE ME!
        "Doing": "In Progress",         // Trello list name : Github column name
    },

    // Optional settings
    githubStatusField: "Status",
    includeArchivedCards: false,
    githubRepositoryMapByListOrLabel: {
        // Trello list or label name : Github repository name
    },
    githubOrg: "inoa",
    trelloJsonFileName: "trello.json",
    githubAppId: 864042,
    githubInstalationId: 48947089,
    githubPrivateKeyFileName: "private-key.pem",
}
