import { Config, ConfigLoader } from "../config/ConfigLoader.js";
import { UIEventEmitter } from "../events/UIEventEmitter.js";

export interface ToolContext {
    config: Config
    configLoader: ConfigLoader,
    eventEmitter: UIEventEmitter
}