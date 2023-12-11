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
    } catch (error: any) {
        console.error(`Failed to read analyze log: ${error.message}`);
        setFailed((error as Error)?.message ?? "Unknown error");
        return;
    }

    try {
        const octokit = getOctokit(token);
        await octokit.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: pullRequest.number,
            labels: [label],
        });
    } catch (error) {
        setFailed((error as Error)?.message ?? "Unknown error");
    }
}

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

if (!process.env.JEST_WORKER_ID) {
    run();
}