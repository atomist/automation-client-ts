import { TreeNode } from "@atomist/tree-path/TreeNode";
import { FileParser } from "../FileParser";

import { defineDynamicProperties, fillInEmptyNonTerminalValues } from "@atomist/tree-path/manipulation/enrichment";
import { File } from "../../../project/File";

import * as ts from "typescript";
import { curry } from "@typed/curry";

/**
 * Allow path expressions against results from a single microgrammar
 */
export class TypeScriptFileParser implements FileParser {

    public rootName = "ts";

    constructor(public scriptTarget: ts.ScriptTarget = ts.ScriptTarget.ES2016,
                public scriptKind: ts.ScriptKind = ts.ScriptKind.TS) {
    }

    public toAst(f: File): Promise<TreeNode> {
        return f.getContent()
            .then(content => {
                const node = ts.createSourceFile(f.name, content, this.scriptTarget, false, this.scriptKind);
                const root = new TypeScriptAstNodeTreeNode(node);
                defineDynamicProperties(root);
                fillInEmptyNonTerminalValues(root, content);
                return root;
            });
    }
}

/**
 * TreeNode implementation backed by a microgrammar match
 */
class TypeScriptAstNodeTreeNode implements TreeNode {

    public readonly $children: TreeNode[] = [];

    public readonly $name;

    public $value: string;

    public readonly $offset: number;

    constructor(node: ts.Node) {
        //console.log(JSON.stringify(node, null, 2));

        function visit(children: TreeNode[], n: ts.Node) {
            if (!!n) {
                children.push(new TypeScriptAstNodeTreeNode(n));
            }
        }

        this.$name = extractName(node);
        ts.forEachChild(node, curry(visit)(this.$children));
        if (this.$children.length === 0) {
            // Get it off the JSON if it doesn't matter
            this.$children = undefined;
        }

        // this.$offset = m.$offset;
        // if (isTreePatternMatch(m)) {
        //     const subs = m.submatches();
        //     this.$children = Object.getOwnPropertyNames(subs)
        //         .map(prop => {
        //             const sub = subs[prop];
        //             // console.log("Exposing child %s.%s as [%s]", $name, prop, JSON.stringify(sub));
        //             return new TypeScriptAstNodeTreeNode(prop, sub);
        //         });

        // console.log("Exposing terminal %s as [%s]: value=[%s]", $name, JSON.stringify(m), m.$matched);
        //this.$value = node.getText();
    }

}

function extractName(node: ts.Node): string {
    if ((node as any).name) {
        return (node as any).name.escapedText;
    } else {
        return ts.SyntaxKind[node.kind];
    }
}
