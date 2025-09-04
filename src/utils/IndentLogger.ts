export class IndentLogger {
    static log(message: string, indent = 0): void {
        if (indent === 0) {
            console.log(message);
        } else {
            console.log(` →  ${message}`);
        }
    }
}