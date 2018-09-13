import "mocha";

import * as assert from "power-assert";
import { metadataFromInstance } from "../../../lib/internal/metadata/metadataReading";
import { CommandHandlerMetadata } from "../../../lib/metadata/automationMetadata";
import { addAtomistSpringAgent } from "./addAtomistSpringAgent";

describe("function style metadata reading", () => {

    it("should get correct handler name", () => {
        assert(metadataFromInstance(addAtomistSpringAgent).name === "AddAtomistSpringAgent");
    });

    it("should extract metadataFromInstance from function sourced command handler", () => {
        const md = metadataFromInstance(addAtomistSpringAgent) as CommandHandlerMetadata;
        assert(md.parameters.length === 1);
        assert(md.parameters[0].name === "slackTeam");
        assert(md.mapped_parameters.length === 1);
        assert(md.mapped_parameters[0].name === "githubWebUrl");
        assert(md.mapped_parameters[0].uri === "atomist://github_url");
        assert(md.secrets.length === 1);
        assert(md.secrets[0].name === "someSecret");
        assert(md.secrets[0].uri === "atomist://some_secret");
        assert(md.values.length === 1);
        assert(md.values[0].name === "port");
        assert(md.values[0].path === "custom.http.port");
        assert.deepEqual(md.intent, ["add agent"]);
        assert.deepEqual(md.tags.map(t => t.name), ["atomist", "spring", "agent"]);
    });
});
