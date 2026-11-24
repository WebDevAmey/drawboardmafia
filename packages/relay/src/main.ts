import { createRelay } from './server';

const port = Number(process.env.PORT ?? 5192);
createRelay({ port }).then((r) => console.log(`drawboardmafia relay listening on :${r.port}`));
