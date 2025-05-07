export default class Logger {
  private readonly name: string;
  private readonly debugMode: boolean;

  constructor(name: string, debugMode: boolean = true) {
      this.name = name;
      this.debugMode = debugMode;
  }

  log(...args: any[]): void {
      if (this.debugMode) {
          console.log(`[${this.name}]`, ...args);
      }
  }

  error(...args: any[]): void {
      console.error(`[${this.name}]`, ...args);
  }

  warn(...args: any[]): void {
      console.warn(`[${this.name}]`, ...args);
  }

  
}