import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createService } from './service';
const globalDb = globalThis as typeof globalThis & {
    campusDb?: ReturnType<typeof createService>;
};
export function database() {
    if (!globalDb.campusDb)
        globalDb.campusDb = (async () => { await mkdir(join(process.cwd(), '.data'), { recursive: true }); const s = await createService(join(process.cwd(), '.data', process.env.CAMPUS_MODE === 'accounts' ? 'accounts' : 'campus')); await s.seed(); return s; })();
    return globalDb.campusDb;
}
