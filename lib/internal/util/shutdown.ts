import * as exitHook from "async-exit-hook";
import { logger } from "../../util/logger";

export const defaultGracePeriod = 10000;

/**
 * Shutdown hook function and metadata.
 */
export interface ShutdownHook {
    /** Function to call at shutdown. */
    hook: () => Promise<number>;
    /** Priority of hook.  Lower number values are executed first. */
    priority: number;
    /** Optional description used in logging. */
    description?: string;
}

let shutdownHooks: ShutdownHook[] = [];

/**
 * Add callback to run when shutdown is initiated prior to process
 * exit.  See [[ShutdownHook]] for description of parameters.
 */
export function registerShutdownHook(cb: () => Promise<number>, priority: number = Number.MAX_VALUE, desc?: string): void {
    const description = desc || `Shutdown hook with priority ${priority}`;
    shutdownHooks = [{ priority, hook: cb, description }, ...shutdownHooks].sort((h1, h2) => h1.priority - h2.priority);
}

/**
 * Run each shutdown hook and collect its result.
 */
export async function executeShutdownHooks(cb: () => void): Promise<never> {
    if (shutdownHooks.length === 0) {
        logger.info("Shutting down");
        cb();
        throw new Error(`async-exit-hook callback returned but should not have`);
    }

    logger.info("Shutdown initiated, calling shutdown hooks");
    let status = 0;
    for (const hook of shutdownHooks) {
        try {
            logger.debug(`Calling shutdown hook '${hook.description}'...`);
            const result = await hook.hook();
            logger.debug(`Shutdown hook '${hook.description}' completed with status '${result}'`);
            status += result;
        } catch (e) {
            logger.warn(`Shutdown hook threw an error: ${e.message}`);
            status += 10;
        }
    }
    logger.info(`Shutdown hooks completed with status '${status}', exiting`);
    shutdownHooks = [];
    cb();
    throw new Error(`async-exit-hook callback returned but should not have`);
}
exitHook(executeShutdownHooks);

/**
 * Set the absolute longer number of milliseconds shutdown should
 * take.
 */
export function setForceExitTimeout(ms: number): void {
    exitHook.forceExitTimeout(ms);
}
