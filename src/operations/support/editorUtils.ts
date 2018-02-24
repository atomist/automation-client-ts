import { HandlerContext } from "../../HandlerContext";
import { logger } from "../../internal/util/logger";
import { GitProject } from "../../project/git/GitProject";
import { Project } from "../../project/Project";
import { EditorOrReviewerParameters } from "../common/params/BaseEditorOrReviewerParameters";
import { RepoRef } from "../common/RepoId";
import {
    BranchCommit,
    EditMode,
    isBranchCommit,
    isCustomExecutionEditMode,
    isPullRequest,
    PullRequest,
} from "../edit/editModes";
import { EditResult, ProjectEditor, successfulEdit } from "../edit/projectEditor";

/**
 * Edit a GitHub project using a PR or branch.
 * Do not attempt any git updates if (a) edited is explicitly set to false by the editor
 * or (b) edited is undefined and git status is not dirty. If edited is explicitly
 * set to true by the editor and the git status is not dirty, this is a developer error
 * which should result in a runtime error.
 * @param context handler context for this operation
 * @param p project
 * @param editor editor to use
 * @param editMode how to persist the edit
 * @param parameters to editor
 * @return EditResult instance that reports as to whether the project was actually edited
 */
export async function editRepo<P extends EditorOrReviewerParameters>(context: HandlerContext,
                                                                     p: Project,
                                                                     editor: ProjectEditor<P>,
                                                                     editMode: EditMode,
                                                                     parameters?: P): Promise<EditResult> {
    if (!!editMode.beforePersist) {
        await editMode.beforePersist(p);
    }
    try {
        if (isPullRequest(editMode)) {
            return editProjectUsingPullRequest(context, p as GitProject, editor, editMode, parameters);
        } else if (isBranchCommit(editMode)) {
            return editProjectUsingBranch(context, p as GitProject, editor, editMode, parameters);
        } else if (isCustomExecutionEditMode(editMode)) {
            return editMode.edit(p, editor, context, parameters);
        } else {
            // No edit to do
            return Promise.resolve(successfulEdit(p, true));
        }
    } finally {
        if (!!editMode.afterPersist) {
            await editMode.afterPersist(p);
        }
    }
}

export function editProjectUsingPullRequest<P>(context: HandlerContext,
                                               gp: GitProject,
                                               editor: ProjectEditor<P>,
                                               pr: PullRequest,
                                               parameters?: P): Promise<EditResult> {

    return editor(gp, context, parameters)
        .then(r => doWithEditResult(r as EditResult<GitProject>, () => raisePr(gp, pr)));
}

export function editProjectUsingBranch<P>(context: HandlerContext,
                                          gp: GitProject,
                                          editor: ProjectEditor<P>,
                                          ci: BranchCommit,
                                          parameters?: P): Promise<EditResult> {

    return editor(gp, context, parameters)
        .then(r =>
            // TODO fix this type cast
            doWithEditResult(r as EditResult<GitProject>, () => createAndPushBranch(gp, ci)));
}

/**
 * Perform git operation on the project only if edited != false or status is dirty
 * @param {EditResult<GitProject>} r
 * @param {() => Promise<EditResult>} gitop
 * @return {Promise<EditResult>}
 */
function doWithEditResult(r: EditResult<GitProject>, gitop: () => Promise<EditResult>): Promise<EditResult> {
    if (r.edited === true) {
        // Do a second check to see if the project is dirty
        return gitop();
    }
    if (r.edited === undefined) {
        // Check git status
        return r.target.gitStatus()
            .then(status => {
                return status.isClean ? ({
                    target: r.target,
                    success: true,
                    edited: false,
                }) : gitop();
            });
    }
    logger.info("NOT committing %j as it's not dirty, edited=%s", r.target.id, r.edited);
    return Promise.resolve(r);
}

/**
 * Create a branch (if it doesn't exist), commit with current content and push
 * @param {GitProject} gp
 * @param {BranchCommit} ci
 */
export function createAndPushBranch(gp: GitProject, ci: BranchCommit): Promise<EditResult> {
    return gp.configureFromRemote()
        .then(() => gp.hasBranch(ci.branch).then(branchExists => {
            if (branchExists) {
                return gp.checkout(ci.branch);
            } else {
                return gp.createBranch(ci.branch); // this also checks it out
            }
        }))
        .then(x => gp.commit(ci.message))
        .then(x => gp.push())
        .then(r => successfulEdit(r.target, true));
}

/**
 * Raise a PR from the current state of the project
 * @param {GitProject} gp
 * @param {PullRequest} pr
 */
export function raisePr(gp: GitProject, pr: PullRequest): Promise<EditResult> {
    return createAndPushBranch(gp, pr)
        .then(x => {
            return gp.raisePullRequest(pr.title, pr.body)
                .then(r => successfulEdit(gp, true));
        });
}
