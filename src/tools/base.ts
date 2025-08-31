import { Config, ConfigLoader } from "../config/ConfigLoader.js";
import { UIEventEmitter } from "../events/UIEventEmitter.js";
import { HITLManager } from "../services/HITLManager.js";

export interface ToolContext {
    config: Config
    configLoader: ConfigLoader,
    eventEmitter: UIEventEmitter,
    hitlManager: HITLManager
}