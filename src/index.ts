import { getInput, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { readFileSync } from 'fs';

// function logVerbose(message) {
//     if (verboseLogging) {
//         console.log(message);
//     }
// }

// function logError(error) {
//     if (verboseLogging) {
//         console.error('Error:', error);
//     }
//     core.setFailed(error);
// }

// ================================
export async function run() {
    const token = getInput("gh_token");
    const label = getInput("label");
    const analyzeLog = getInput("analyze_log");

    const pullRequest = context.payload.pull_request;

    if (!pullRequest) {
        throw new Error("This action can only be run on Pull Requests");
    }

    let issues: Issue[];
    try {
        const analyzerOutput = readFileSync(analyzeLog, 'utf-8');
        console.log(`Analyzer output: ${analyzerOutput}`);
        issues = parseAnalyzerOutputs(analyzerOutput, "workingDir");
        console.log(`Parsed issues: ${JSON.stringify(issues, null, 2)}`);
    } catch (error) {
        setFailed(`Failed to read analyze log: ${(error as Error)?.message ?? "Unknown error"}`);
        // setFailed((error as Error)?.message ?? "Unknown error");
        return;
    }

    const octokit = getOctokit(token);
    try {
        await octokit.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: pullRequest.number,
            labels: [label],
        });
    } catch (error) {
        setFailed(`Failed to set Label: ${(error as Error)?.message ?? "Unknown error"}`);
    }

    const body = `Ruff Check commenter found ${issues.length} issues`;
    try {
        await octokit.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: body
        });
        console.log(`Number of issues exceeds maximum: ${issues.length}`);
        return;
    }
    catch (error) {
        setFailed((error as Error)?.message ?? "Unknown error");
        return;
    }

    // Retrieve diff
    let diff;
    try {
        const response = await octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.issue.number,
            mediaType: {
                format: "diff",
            }
        });
        console.info('Received diff from GitHub.');
        console.info(response.data);
        // diff = new Diff(response.data);
        // console.log(`Diff: ${JSON.stringify(diff, null, 2)}`);
    } catch (error) {
        setFailed((error as Error)?.message ?? "Unknown error");
        // logError(`Failed to retrieve diff: ${error.message}`);
        return;
    }

    let inlineComments;
    // inlineComments = issues.map(group => new Comment(group));

    // Add new comments to the PR
    // for (const comment of commentsToAdd) {
    //     try {
    //         await octokit.rest.pulls.createReviewComment({
    //             owner: context.repo.owner,
    //             repo: context.repo.repo,
    //             pull_number: context.issue.number,
    //             commit_id: pullRequest.head.sha,
    //             path: comment.path,
    //             side: "RIGHT",
    //             line: comment.line,
    //             body: comment.body
    //         });
    //     } catch (error) {
    //         setFailed((error as Error)?.message ?? "Unknown error");
    //     }
    // }
}

if (!process.env.JEST_WORKER_ID) {
    run();
}

// ================================

// helper function and interface
// set each item to Issue from log lines
function parseAnalyzerOutputs(analyzeLog: string, workingDir: string) {
    const regex = /(.+):(\d+):(\d+):(.+)/g;
    const issues: Issue[] = [];
    let match;
    while ((match = regex.exec(analyzeLog))) {
        issues.push({
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            message: match[4],
        })
    }
    return issues;
}

interface Issue {
    file: string;
    line: number;
    column: number;
    message: string;
}

class Diff {
    files: any
    constructor(data: any) {
        this.files = {};
        this.parse(data);
    }

    parse(data: any) {
        const diffLines = data.split('\n');
        let currentFile = '';
        let lineCounter = 0;

        for (const line of diffLines) {
            if (line.startsWith('+++ b/')) {
                currentFile = line.replace('+++ b/', '');
                lineCounter = 0;
            } else {
                const hunkHeaderMatch = line.match(/^@@ -\d+,?\d* \+(\d+),?\d* @@/);
                if (hunkHeaderMatch) {
                    lineCounter = parseInt(hunkHeaderMatch[1], 10) - 1;
                } else if (line.startsWith('+')) {
                    lineCounter++;
                    this.addFileChange(currentFile, line);
                } else if (!line.startsWith('-')) {
                    lineCounter++;
                }
            }
        }
    }

    addFileChange(fileName: string, line: number) {
        if (!this.files[fileName]) {
            this.files[fileName] = new DiffFile(fileName);
        }
        this.files[fileName].addChange(line);
    }
}

class DiffFile {
    fileName: string;
    changes: number[];
    constructor(file: string) {
        this.fileName = file;
        this.changes = [];
    }

    addChange(line: number) {
        this.changes.push(line);
    }

    hasChange(line: number) {
        return this.changes.includes(line);
    }
}



class Comment {
    path: string;
    line: number;
    body: string;
    constructor(issue: Issue) {
        this.path = issue.file;
        this.line = issue.line;
        this.body = '<table><thead><tr><th>Level</th><th>Message</th></tr></thead><tbody>';
        // this.body += issues.map(issue => {
        //     // return `<tr><td>${levelIcon[issue.level]}</td><td>${issue.message}</td></tr>`;
        //     return `<tr><td>info</td><td>${issue.message}</td></tr>`;
        // }).join('');
        this.body += '</tbody></table><!-- Flutter Analyze Commenter: issue -->';
    }
}