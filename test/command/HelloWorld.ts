import { SlackMessage } from "@atomist/slack-messages/SlackMessages";
<<<<<<< HEAD
import { CommandHandler, Parameter } from "../../src/decorators";
import { Failure } from "../../src/HandlerResult";
import { HandleCommand, HandlerContext, HandlerResult } from "../../src/Handlers";
=======
import { CommandHandler, Parameter } from "../../src/decorators";
import { Failure } from "../../src/HandlerResult";
import { HandleCommand, HandlerContext, HandlerResult } from "../../src/Handlers";
import { sendMessages } from "../../src/operations/support/contextUtils";
import { buttonForCommand, menuForCommand } from "../../src/spi/message/MessageClient";
import { SecretBaseHandler } from "./SecretBaseHandler";

@CommandHandler("Send a hello back to the client", "hello cd")
export class HelloWorld extends SecretBaseHandler implements HandleCommand {

    @Parameter({description: "Name of person the greeting should be send to", pattern: /^.*$/})
    public name: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        console.log(`Incoming parameter was ${this.name}`);

        if (this.name === "fail") {
            return Promise.resolve(Failure);
        }

        const msg: SlackMessage = {
            text: `Send hello again, @${this.name}?`,
            attachments: [{
                fallback: "Some buttons",
                actions: [
                    buttonForCommand({text: "yes"}, "HelloWorld", { name: this.name }),
                    menuForCommand({text: "select name", options:
                            [ { value: "cd", text: "cd" }, { value: "kipz", text: "kipz"}]},
                        "HelloWorld", "name"),
                ],
            }],
        };

        ctx.messageClient.recordAddressUsers(msg, "cd");
            // .recordRespond(`Hello ${this.name}`)
            // .recordRespond(msg)
            // .recordAddressChannels(msg, "general");
        return sendMessages(ctx);
    }
}
