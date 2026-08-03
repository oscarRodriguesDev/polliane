/**
 * Declaração mínima para o módulo experimental `node:sqlite`.
 * Necessária porque o projeto usa @types/node@20, que ainda não inclui
 * os tipos desse módulo (adicionados apenas no @types/node@22.5+).
 * Cobre apenas a superfície usada em src/lib/db.ts.
 */
declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | Uint8Array | null;
  type SQLOutputValue = string | number | bigint | Uint8Array | null;

  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    get(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    all(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue>[];
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
  }

  class DatabaseSync {
    constructor(path: string, options?: { open?: boolean });
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
