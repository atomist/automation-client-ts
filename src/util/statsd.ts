import Timer = NodeJS.Timer;
import * as cluster from "cluster";
import { ClientOptions, StatsD } from "hot-shots";

import { runningAutomationClient } from "../automationClient";
import { Configuration } from "../configuration";
import { EventFired } from "../HandleEvent";
import { AutomationContextAware, HandlerContext } from "../HandlerContext";
import { HandlerResult } from "../HandlerResult";
import { CommandInvocation } from "../internal/invoker/Payload";
import { RequestProcessor } from "../internal/transport/RequestProcessor";
import { logger } from "../internal/util/logger";
import { registerShutdownHook } from "../internal/util/shutdown";
import { AutomationEventListenerSupport } from "../server/AutomationEventListener";
import { Destination, MessageOptions, SlackDestination } from "../spi/message/MessageClient";

export interface StatsdOptions {
    host?: string;
    port?: number;
}

export class StatsdAutomationEventListener extends AutomationEventListenerSupport {

    private statsd: StatsD;
    private timer: Timer;
    private configuration: Configuration;
    private registrationName: string;

    constructor(private options: StatsdOptions) {
        super();
        this.configuration = runningAutomationClient.configuration;
        this.registrationName = `${this.configuration.name}/${this.configuration.version}`;
        this.initStatsd();
    }

    public registrationSuccessful(handler: RequestProcessor) {
        this.increment("counter.registration");
        this.event("event.registration", `New registration for ${this.registrationName}`);
    }

    public contextCreated(ctx: HandlerContext) {
        const context = (ctx as any as AutomationContextAware).context;
        const graphClient = ctx.graphClient;

        // On the cluster master we don't have a GraphClient
        if (graphClient) {

            const tags = [
                `atomist_operation:${context.operation}`,
                `atomist_operation_type:command`,
                ...this.teamDetail(ctx),
            ];

            ctx.graphClient = {
                endpoint: graphClient.endpoint,
                executeMutation: (mutation: string, variables?: any, options?: any) => {
                    const start = Date.now();
                    return graphClient.executeMutation(mutation, variables, options)
                        .then(result => {
                            this.statsd.increment("counter.graphql.mutation.success", 1, 1, tags, this.callback);
                            this.statsd.timing("timer.graphql.mutation", Date.now() - start, 1, tags, this.callback);
                            return result;
                        })
                        .catch(err => {
                            this.statsd.increment("counter.graphql.mutation.failure", 1, 1, tags, this.callback);
                            this.statsd.timing("timer.graphql.mutation", Date.now() - start, 1, tags, this.callback);
                            return err;
                        });
                },
                executeMutationFromFile: graphClient.executeMutationFromFile,
                executeQuery: (query: string, variables?: any, options?: any) => {
                    const start = Date.now();
                    return graphClient.executeQuery(query, variables, options)
                        .then(result => {
                            this.statsd.increment("counter.graphql.query.success", 1, 1, tags, this.callback);
                            this.statsd.timing("timer.graphql.query", Date.now() - start, 1, tags, this.callback);
                            return result;
                        })
                        .catch(err => {
                            this.statsd.increment("counter.graphql.query.failure", 1, 1, tags, this.callback);
                            this.statsd.timing("timer.graphql.query", Date.now() - start, 1, tags, this.callback);
                            return err;
                        });

                },
                executeQueryFromFile: graphClient.executeQueryFromFile,
            };
        }
    }

    public commandSuccessful(payload: CommandInvocation, ctx: HandlerContext, result: HandlerResult): Promise<any> {
        const tags = [
            `atomist_operation:${payload.name}`,
            `atomist_operation_type:command`,
            ...this.teamDetail(ctx),
        ];
        this.increment("counter.operation.success", tags);
        this.timing("timer.operation", ctx, tags);
        return Promise.resolve();
    }

    public commandFailed(payload: CommandInvocation, ctx: HandlerContext, err: any): Promise<any> {
        const tags = [
            `atomist_operation:${payload.name}`,
            `atomist_operation_type:command`,
            ...this.teamDetail(ctx),
        ];
        this.increment("counter.operation.failure", tags);
        this.timing("timer.operation", ctx, tags);
        this.event("event.operation.failure", "Unsuccessfully invoked command", tags);
        return Promise.resolve();
    }

    public eventSuccessful(payload: EventFired<any>, ctx: HandlerContext, result: HandlerResult[]): Promise<any> {
        const tags = [
            `atomist_operation:${payload.extensions.operationName}`,
            `atomist_operation_type:event`,
            ...this.teamDetail(ctx),
        ];
        this.increment("counter.operation.success", tags);
        this.timing("timer.operation", ctx, tags);
        return Promise.resolve();
    }

    public eventFailed(payload: EventFired<any>, ctx: HandlerContext, err: any): Promise<any> {
        const tags = [
            `atomist_operation:${payload.extensions.operationName}`,
            `atomist_operation_type:event`,
            ...this.teamDetail(ctx),
        ];
        this.increment("counter.operation.failure", tags);
        this.timing("timer.operation", ctx, tags);
        this.event("event.operation.failure", "Unsuccessfully invoked event", tags);
        return Promise.resolve();
    }

    public messageSent(message: any,
                       destinations: Destination | Destination[],
                       options: MessageOptions,
                       ctx: HandlerContext & AutomationContextAware) {
        let type: string;
        destinations = Array.isArray(destinations) ? destinations : [destinations];
        destinations.forEach(d => {
            if (d.userAgent === "slack") {
                const sd = d as SlackDestination;
                if (sd.users && sd.users.length > 0) {
                    type = "slack_users";
                } else if (sd.channels && sd.channels.length > 0) {
                    type = "slack_channels";
                } else {
                    type = "slack_response";
                }
            }
        });
        this.increment("counter.message", [
            `atomist_message_type:${type}`,
            ...this.teamDetail(ctx),
        ]);
    }

    /** Do-nothing callback */
    private callback(err: Error) {
        return;
    }

    private increment(stat: string | string[],
                      tags?: string[]) {
        if (cluster.isMaster) {
            this.statsd.increment(stat, 1, 1, tags, this.callback);
        }
    }

    private event(title: string, text?: string, tags?: string[]) {
        if (cluster.isMaster) {
            this.statsd.event(`automation_client.${title}`, text, {}, tags, this.callback);
        }
    }

    private timing(stat: string | string[],
                   ctx: HandlerContext,
                   tags?: string[]) {
        if (cluster.isMaster &&
            ctx &&
            (ctx as any as AutomationContextAware).context &&
            (ctx as any as AutomationContextAware).context.ts) {
            const context = (ctx as any as AutomationContextAware).context;
            this.statsd.timing(stat, Date.now() - context.ts, 1, tags, this.callback);
        }
    }

    private initStatsd() {
        const options: ClientOptions = {
            prefix: "automation_client.",
            host: this.options.host || "localhost",
            port: this.options.port,
            globalTags: [
                `atomist_name:${this.configuration.name.replace("@", "").replace("/", ".")}`,
                `atomist_version:${this.configuration.version}`,
                `atomist_environment:${this.configuration.environment}`,
                `atomist_application_id:${this.configuration.application}`,
                `atomist_process_id:${process.pid}`,
            ],
        };
        this.statsd = new StatsD(options);
        this.timer = setInterval(() => {
            this.submitHeapStats();
        }, 5000);

        // Register orderly shutdown
        registerShutdownHook(() => {
            this.event("event.shutdown", `Shutting down client ${this.registrationName}`);
            this.statsd.close(() => {
                logger.debug("Closing StatsD connection");
            });
            return Promise.resolve(0);
        });
    }

    private teamDetail(ctx: HandlerContext): string[] {
        if (ctx && (ctx as any as AutomationContextAware).context) {
            const context = (ctx as any as AutomationContextAware).context;
            const safeTeamName = context.teamName ?
                context.teamName.trim().replace(/ /g, "_").replace(/\W/g, "") : undefined;
            return [
                `atomist_team_id:${context.teamId}`,
                `atomist_team_name:${safeTeamName}`,
            ];
        } else {
            return [];
        }
    }

    private submitHeapStats() {
        const heap = process.memoryUsage();
        this.statsd.gauge("heap.rss", heap.rss, 1, [], this.callback);
        this.statsd.gauge("heap.total", heap.heapTotal, 1, [], this.callback);
        this.statsd.gauge("heap.used", heap.heapUsed, 1, [], this.callback);
    }
}
